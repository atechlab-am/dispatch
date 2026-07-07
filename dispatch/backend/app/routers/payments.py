"""Stripe webhook receiver.

Deliberately its own router: this is the only endpoint in the entire app with
zero auth dependency (Stripe's servers call it, not a logged-in user). Signature
verification via STRIPE_WEBHOOK_SECRET is the sole gate — if that secret isn't
configured, the endpoint refuses to accept anything rather than trusting an
unverified payload.
"""
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.orm import Session

from .. import config
from ..database import SessionLocal
from ..models.models import Invoice, InvoicePayment
from .invoices import _apply_payment_and_maybe_mark_paid

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not config.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Online payments are not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, config.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        _handle_checkout_completed(session)

    return {"received": True}


def _handle_checkout_completed(session: dict) -> None:
    invoice_id = (session.get("metadata") or {}).get("invoice_id")
    payment_intent = session.get("payment_intent")
    if not invoice_id:
        return

    db: Session = SessionLocal()
    try:
        # Idempotency: Stripe retries webhook delivery, so a payment already
        # recorded for this payment_intent means this event was already processed.
        if payment_intent and db.query(InvoicePayment).filter(
            InvoicePayment.stripe_payment_intent_id == payment_intent
        ).first():
            return

        inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not inv:
            return

        amount = round((session.get("amount_total") or 0) / 100, 2)
        payment = InvoicePayment(
            invoice_id=inv.id,
            amount=amount,
            method="stripe",
            note="Paid online via Stripe",
            payment_date=datetime.now(timezone.utc).date(),
            recorded_by=None,
            stripe_payment_intent_id=payment_intent,
            created_at=datetime.now(timezone.utc),
        )
        _apply_payment_and_maybe_mark_paid(inv, payment, db, actor_id=None, actor_label="Stripe")
        db.commit()
    finally:
        db.close()
