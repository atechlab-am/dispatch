"""Inbound email webhook (email-to-ticket).

Deliberately its own router with zero auth dependency, same shape as
routers/payments.py's Stripe webhook — the only other endpoint in the app
with no auth. A shared secret embedded in the URL path is the sole gate
(Postmark's inbound webhook offers no signature verification the way Stripe
does): a wrong or missing secret 404s rather than 401/403, so the endpoint's
existence isn't even confirmable to someone probing the URL.
"""
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import Ticket, TicketComment, ClientType, TicketPriority
from ..audit import write_audit
from ..notifications import create_notification
from .tickets import _make_ticket_id, _sla_deadlines

router = APIRouter(prefix="/inbound-email", tags=["inbound-email"])
logger = logging.getLogger(__name__)

TICKET_ID_RE = re.compile(r"\[(TKT-\d{4}-\d{5})\]")
FROM_HEADER_RE = re.compile(r"<([^>]+)>")


def _extract_sender(payload: dict) -> tuple[str, str]:
    """Return (email, display_name) from a Postmark-shaped inbound payload."""
    email = ((payload.get("FromFull") or {}).get("Email") or "").strip()
    raw_from = payload.get("From") or ""
    if not email:
        m = FROM_HEADER_RE.search(raw_from)
        email = m.group(1).strip() if m else raw_from.strip()
    name = ((payload.get("FromFull") or {}).get("Name") or "").strip()
    if not name:
        name = raw_from.split("<")[0].strip().strip('"') or email
    return email, name


def _extract_body(payload: dict) -> str:
    text = payload.get("TextBody") or ""
    if text:
        return text
    html = payload.get("HtmlBody") or ""
    return re.sub(r"<[^>]+>", "", html).strip()


@router.post("/{secret}")
async def inbound_email_webhook(secret: str, request: Request, db: Session = Depends(get_db)):
    if not config.INBOUND_EMAIL_SECRET or secret != config.INBOUND_EMAIL_SECRET:
        raise HTTPException(status_code=404)

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        _handle_inbound_email(payload, db)
    except Exception:
        # Log and swallow — Postmark expects 2xx or it will retry/dead-letter.
        # A malformed-but-parseable payload should never surface as a 5xx here.
        logger.exception("Failed to process inbound email payload")

    return {"received": True}


def _handle_inbound_email(payload: dict, db: Session) -> None:
    message_id = (payload.get("MessageID") or "").strip() or None
    if message_id:
        existing = db.query(TicketComment).filter(TicketComment.external_message_id == message_id).first()
        if existing:
            return  # already processed this exact inbound message (webhook retry)

    sender_email, sender_name = _extract_sender(payload)
    subject = payload.get("Subject") or ""
    body = _extract_body(payload)

    match = TICKET_ID_RE.search(subject)
    ticket = None
    if match:
        ticket = db.query(Ticket).filter(Ticket.id == match.group(1)).first()

    if ticket:
        # Threading onto an existing ticket. We deliberately do NOT reject replies
        # where the sender's address doesn't match ticket.client_email — CCed staff,
        # forwarded threads, and client staff turnover are all legitimate reasons a
        # different address might reply, and rejecting risks silently dropping a
        # real client reply. Postmark's inbound payload offers no sender
        # verification (no SPF/DKIM pass-through) to check anyway. Since these
        # comments are always non-internal and never touch billing/internal_notes,
        # the residual risk is limited to client-visible-comment noise, not data
        # exposure or financial impact.
        comment = TicketComment(
            ticket_id=ticket.id,
            author_id=None,
            author_label=sender_name or sender_email,
            external_message_id=message_id,
            body=body,
            is_internal=False,
        )
        db.add(comment)
        db.commit()

        if ticket.assigned_to:
            create_notification(
                db, user_id=ticket.assigned_to, ticket_id=ticket.id, kind="comment_added",
                message=f"New reply from {sender_email} on ticket {ticket.id}",
            )
        write_audit(db, ticket_id=ticket.id, actor_id=None, actor_label=sender_email, action="comment_added")
        db.commit()
        return

    # No ticket ID in the subject, or the tagged ticket no longer exists — either
    # way, create a new ticket from the email rather than erroring (Postmark
    # expects 200; erroring here would just cause pointless retries).
    ticket_id = _make_ticket_id(db)
    now = datetime.now(timezone.utc)
    sla_response, sla_resolution = _sla_deadlines(TicketPriority.medium.value, now)
    new_ticket = Ticket(
        id=ticket_id,
        client_type=ClientType.business,
        client_name=sender_name or sender_email,
        client_email=sender_email,
        title=subject or "(no subject)",
        description=body,
        priority=TicketPriority.medium,
        created_by=None,
        created_at=now,
        updated_at=now,
        sla_response_due=sla_response,
        sla_resolution_due=sla_resolution,
    )
    db.add(new_ticket)
    db.commit()

    write_audit(db, ticket_id=ticket_id, actor_id=None, actor_label=sender_email, action="created")
    db.commit()
