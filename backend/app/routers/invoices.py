import html as html_lib
from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Invoice, InvoiceLine, InvoicePayment, InvoiceStatus, User, Ticket, TicketStatus
from ..security import get_current_user
from .. import email as mail
from ..audit import write_audit

router = APIRouter(prefix="/invoices", tags=["invoices"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class InvoiceLineIn(BaseModel):
    description: str = Field("", max_length=500)
    qty: float = 1
    unit_price: float = 0
    amount: float = 0


class InvoiceLineOut(BaseModel):
    id: int
    description: str
    qty: float
    unit_price: float
    amount: float
    model_config = {"from_attributes": True}


class InvoiceIn(BaseModel):
    ticket_id: Optional[str] = None
    client_id: Optional[int] = None
    client_name: str = Field("", max_length=255)
    client_email: str = Field("", max_length=255)
    client_address: str = Field("", max_length=1000)
    status: InvoiceStatus = InvoiceStatus.draft
    issue_date: date = Field(default_factory=date.today)
    due_date: Optional[date] = None
    notes: str = Field("", max_length=5000)
    tax_rate: float = 0
    lines: list[InvoiceLineIn] = Field(default=[], max_length=200)


class LinkedTicketOut(BaseModel):
    id: str
    title: str
    status: str
    billing_status: str
    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: str
    ticket_id: Optional[str]
    client_id: Optional[int]
    client_name: str
    client_email: str
    client_address: str
    status: InvoiceStatus
    issue_date: date
    due_date: Optional[date]
    notes: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    created_at: datetime
    updated_at: datetime
    created_by: int
    lines: list[InvoiceLineOut] = []
    amount_paid: float = 0
    balance: float = 0
    linked_tickets: list[LinkedTicketOut] = []
    model_config = {"from_attributes": True}


class PaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    method: str = Field("", max_length=50)
    note: str = Field("", max_length=500)
    payment_date: date = Field(default_factory=date.today)


class PaymentOut(BaseModel):
    id: int
    invoice_id: str
    amount: float
    method: str
    note: str
    payment_date: date
    recorded_by: Optional[int] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class InvoiceListItem(BaseModel):
    id: str
    client_name: str
    status: InvoiceStatus
    issue_date: date
    due_date: Optional[date]
    total: float
    created_at: datetime
    model_config = {"from_attributes": True}


class InvoicesPage(BaseModel):
    items: list[InvoiceListItem]
    total: int
    page: int
    page_size: int


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_invoice_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"INV-{year}-"
    last = (
        db.query(Invoice)
        .filter(Invoice.id.like(f"{prefix}%"))
        .order_by(Invoice.id.desc())
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.id.replace(prefix, "")) + 1
        except ValueError:
            pass
    return f"{prefix}{n:05d}"


def _compute_totals(lines: list[InvoiceLineIn], tax_rate: float):
    subtotal = sum(l.amount for l in lines)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax_amount, 2)
    return round(subtotal, 2), tax_amount, total


def _sync_ticket_billing(inv: Invoice, db: Session, *, actor_id: Optional[int] = None, actor_label: str = "System") -> None:
    """Sync linked tickets' billing (and workflow) status when the invoice changes.

    Added to an invoice → billing_status "invoiced".
    Invoice paid          → billing_status "paid" AND workflow status Closed.

    `actor_id`/`actor_label` identify the human who triggered this (e.g. whoever
    recorded the payment) so the resulting ticket audit entries aren't misattributed
    to an anonymous "System" actor.
    """
    if not inv.linked_tickets:
        return
    if inv.status == InvoiceStatus.paid:
        for t in inv.linked_tickets:
            if t.billing_status != "paid":
                write_audit(db, ticket_id=t.id, actor_id=actor_id, actor_label=actor_label,
                            action="status_changed", field="status",
                            old_value=str(t.status.value if hasattr(t.status, "value") else t.status),
                            new_value=str(TicketStatus.closed.value))
            t.billing_status = "paid"
            t.status = TicketStatus.closed
    elif inv.status in (InvoiceStatus.draft, InvoiceStatus.sent):
        for t in inv.linked_tickets:
            if t.billing_status != "paid":
                t.billing_status = "invoiced"


def _apply_payment_and_maybe_mark_paid(
    inv: Invoice, payment: InvoicePayment, db: Session, *, actor_id: Optional[int] = None, actor_label: str = "System",
) -> None:
    """Insert a payment and, if it brings the balance to zero, mark the invoice
    Paid (which in turn closes its linked tickets via _sync_ticket_billing).

    Shared by the manual "record payment" endpoint and the Stripe webhook so the
    auto-mark-paid business rule lives in exactly one place.
    """
    db.add(payment)
    db.flush()
    paid = float(sum(float(px.amount) for px in inv.payments))
    if paid >= float(inv.total):
        inv.status = InvoiceStatus.paid
        _sync_ticket_billing(inv, db, actor_id=actor_id, actor_label=actor_label)


def _enrich(inv: Invoice) -> dict:
    """Return InvoiceOut dict with computed amount_paid, balance, and linked_tickets."""
    data = InvoiceOut.model_validate(inv).model_dump()
    paid = float(sum(p.amount for p in inv.payments))
    data["amount_paid"] = round(paid, 2)
    data["balance"] = round(float(inv.total) - paid, 2)
    data["linked_tickets"] = [
        {"id": t.id, "title": t.title, "status": t.status, "billing_status": t.billing_status}
        for t in inv.linked_tickets
    ]
    return data


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", response_model=InvoicesPage)
def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Invoice)
    if status_filter and status_filter != "All":
        q = q.filter(Invoice.status == status_filter)
    total = q.count()
    items = q.order_by(Invoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return InvoicesPage(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subtotal, tax_amount, total = _compute_totals(body.lines, body.tax_rate)
    now = datetime.now(timezone.utc)
    inv = Invoice(
        id=_make_invoice_id(db),
        ticket_id=body.ticket_id,
        client_id=body.client_id,
        client_name=body.client_name,
        client_email=body.client_email,
        client_address=body.client_address,
        status=body.status,
        issue_date=body.issue_date,
        due_date=body.due_date,
        notes=body.notes,
        subtotal=subtotal,
        tax_rate=body.tax_rate,
        tax_amount=tax_amount,
        total=total,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(inv)
    db.flush()
    for l in body.lines:
        db.add(InvoiceLine(invoice_id=inv.id, description=l.description, qty=l.qty, unit_price=l.unit_price, amount=l.amount))
    db.commit()
    db.refresh(inv)
    return _enrich(inv)


class UnbilledTicketOut(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}


def _client_id_set(db: Session, client_id: int) -> set[int]:
    """Return all client IDs in the same company as client_id (company-wide scope)."""
    from ..models.models import Client
    anchor = db.query(Client).filter(Client.id == client_id).first()
    if not anchor or not anchor.company:
        return {client_id}
    siblings = db.query(Client.id).filter(Client.company == anchor.company).all()
    return {row[0] for row in siblings}


# NOTE: this static route MUST be declared before the dynamic "/{invoice_id}" route
# below, otherwise "/invoices/unbilled-tickets" is captured as invoice_id="unbilled-tickets".
@router.get("/unbilled-tickets", response_model=list[UnbilledTicketOut])
def list_unbilled_tickets_for_client(
    client_id: Optional[int] = Query(None),
    client_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return unbilled *resolved* tickets for a client before an invoice exists (new-invoice creation)."""
    q = db.query(Ticket).filter(
        or_(Ticket.billing_status == "unbilled", Ticket.billing_status == None),
        Ticket.status == TicketStatus.resolved,
    )
    if client_id:
        ids = _client_id_set(db, client_id)
        q = q.filter(Ticket.client_id.in_(ids))
    elif client_name:
        q = q.filter(Ticket.client_name == client_name)
    else:
        return []
    return q.order_by(Ticket.created_at.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _enrich(inv)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: str,
    body: InvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    subtotal, tax_amount, total = _compute_totals(body.lines, body.tax_rate)
    inv.ticket_id = body.ticket_id
    inv.client_id = body.client_id
    inv.client_name = body.client_name
    inv.client_email = body.client_email
    inv.client_address = body.client_address
    inv.status = body.status
    inv.issue_date = body.issue_date
    inv.due_date = body.due_date
    inv.notes = body.notes
    inv.tax_rate = body.tax_rate
    inv.subtotal = subtotal
    inv.tax_amount = tax_amount
    inv.total = total
    inv.updated_at = datetime.now(timezone.utc)

    db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete()
    db.flush()
    for l in body.lines:
        db.add(InvoiceLine(invoice_id=inv.id, description=l.description, qty=l.qty, unit_price=l.unit_price, amount=l.amount))
    _sync_ticket_billing(inv, db, actor_id=current_user.id, actor_label=current_user.name)
    db.commit()
    db.refresh(inv)
    return _enrich(inv)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from ..models.models import invoice_tickets
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Reset billing status on the tickets this invoice covered. Deleting the invoice
    # removes the join rows via CASCADE but would otherwise leave the tickets stuck
    # showing "invoiced"/"paid" with no invoice behind them.
    linked_ids = [t.id for t in inv.linked_tickets]
    db.delete(inv)
    db.flush()  # join rows are gone after flush, so "still linked elsewhere" is accurate
    for tid in linked_ids:
        still_linked = db.execute(
            invoice_tickets.select().where(invoice_tickets.c.ticket_id == tid)
        ).first()
        if not still_linked:
            ticket = db.query(Ticket).filter(Ticket.id == tid).first()
            if ticket:
                ticket.billing_status = "unbilled"
    db.commit()


# ─── Ticket linking ───────────────────────────────────────────────────────────

class AttachTicketsIn(BaseModel):
    ticket_ids: list[str]


@router.get("/{invoice_id}/unbilled-tickets", response_model=list[UnbilledTicketOut])
def list_unbilled_tickets(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return unbilled *resolved* tickets in the same company as this invoice's client."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    q = db.query(Ticket).filter(
        or_(Ticket.billing_status == "unbilled", Ticket.billing_status == None),
        Ticket.status == TicketStatus.resolved,
    )
    if inv.client_id:
        ids = _client_id_set(db, inv.client_id)
        q = q.filter(Ticket.client_id.in_(ids))
    else:
        # No client_id — match by client_name (manual entry invoices)
        q = q.filter(Ticket.client_name == inv.client_name)

    # Exclude tickets already on this invoice
    already = {t.id for t in inv.linked_tickets}
    tickets = [t for t in q.order_by(Ticket.created_at.desc()).all() if t.id not in already]
    return tickets


@router.post("/{invoice_id}/tickets", response_model=InvoiceOut)
def attach_tickets(
    invoice_id: str,
    body: AttachTicketsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attach tickets to an invoice and import their service lines + hour logs as invoice lines."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # A ticket that is already invoiced or paid (on any invoice) must not be billed
    # again. Validate up-front so the whole request is rejected atomically rather than
    # partially attaching. Tickets already on *this* invoice are a harmless no-op.
    on_this_invoice = {t.id for t in inv.linked_tickets}
    already_billed = [
        tid for tid in body.ticket_ids
        if tid not in on_this_invoice
        and (t := db.query(Ticket).filter(Ticket.id == tid).first()) is not None
        and t.billing_status in ("invoiced", "paid")
    ]
    if already_billed:
        raise HTTPException(
            status_code=409,
            detail=f"Already invoiced and cannot be billed again: {', '.join(already_billed)}",
        )

    for tid in body.ticket_ids:
        ticket = db.query(Ticket).filter(Ticket.id == tid).first()
        if not ticket:
            continue
        if ticket in inv.linked_tickets:
            continue

        inv.linked_tickets.append(ticket)
        ticket.billing_status = "invoiced"

        # Import service lines
        for sl in ticket.service_lines:
            qty = sl.qty + (sl.extra_qty or 0)
            unit = float(sl.base) + float(sl.per_unit) * float(sl.extra_qty or 0)
            amount = round(float(sl.rate) * qty if float(sl.rate) > 0 else unit, 2)
            db.add(InvoiceLine(
                invoice_id=inv.id,
                description=f"[{ticket.id}] {sl.name}",
                qty=qty,
                unit_price=round(float(sl.rate) if float(sl.rate) > 0 else unit / max(qty, 1), 2),
                amount=amount,
            ))

        # Import hour logs
        for hl in ticket.hour_logs:
            hours = float(hl.hours)
            rate = float(hl.rate)
            db.add(InvoiceLine(
                invoice_id=inv.id,
                description=f"[{ticket.id}] Labour{' — ' + hl.description if hl.description else ''}",
                qty=hours,
                unit_price=rate,
                amount=round(hours * rate, 2),
            ))

        # Import materials used
        for tm in ticket.materials_used:
            unit_price = float(tm.unit_price)
            db.add(InvoiceLine(
                invoice_id=inv.id,
                description=f"[{ticket.id}] {tm.name}",
                qty=tm.qty,
                unit_price=unit_price,
                amount=round(unit_price * tm.qty, 2),
            ))

    db.flush()
    # Recompute totals
    all_lines = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == inv.id).all()
    subtotal = round(sum(float(l.amount) for l in all_lines), 2)
    tax = round(subtotal * float(inv.tax_rate), 2)
    inv.subtotal = subtotal
    inv.tax_amount = tax
    inv.total = round(subtotal + tax, 2)
    inv.updated_at = datetime.now(timezone.utc)
    # Keep billing status consistent with the invoice (e.g. paid invoice → paid tickets)
    _sync_ticket_billing(inv, db, actor_id=current_user.id, actor_label=current_user.name)
    db.commit()
    db.refresh(inv)
    return _enrich(inv)


@router.delete("/{invoice_id}/tickets/{ticket_id}", response_model=InvoiceOut)
def detach_ticket(
    invoice_id: str,
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Remove a ticket from an invoice, drop its imported lines, and recompute totals."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if ticket and ticket in inv.linked_tickets:
        inv.linked_tickets.remove(ticket)

        # Drop the line items that were imported from this ticket so the invoice
        # total no longer charges for a ticket that is no longer linked.
        db.query(InvoiceLine).filter(
            InvoiceLine.invoice_id == inv.id,
            InvoiceLine.description.like(f"[{ticket_id}]%"),
        ).delete(synchronize_session=False)
        db.flush()

        # Recompute totals from the remaining lines
        remaining = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == inv.id).all()
        subtotal = round(sum(float(l.amount) for l in remaining), 2)
        tax = round(subtotal * float(inv.tax_rate), 2)
        inv.subtotal = subtotal
        inv.tax_amount = tax
        inv.total = round(subtotal + tax, 2)
        inv.updated_at = datetime.now(timezone.utc)

        # Only revert to unbilled if not on another invoice
        from ..models.models import invoice_tickets
        still_linked = db.execute(
            invoice_tickets.select().where(invoice_tickets.c.ticket_id == ticket_id)
        ).fetchall()
        if not still_linked:
            ticket.billing_status = "unbilled"
    db.commit()
    db.refresh(inv)
    return _enrich(inv)


class MarkPaidIn(BaseModel):
    ticket_ids: list[str]


@router.post("/tickets/mark-paid", status_code=status.HTTP_204_NO_CONTENT)
def mark_tickets_paid(
    body: MarkPaidIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk-mark tickets as paid and close them (paid work is fully done)."""
    db.query(Ticket).filter(Ticket.id.in_(body.ticket_ids)).update(
        {"billing_status": "paid", "status": TicketStatus.closed}, synchronize_session=False
    )
    db.commit()


# ─── Payments ─────────────────────────────────────────────────────────────────

@router.get("/{invoice_id}/payments", response_model=list[PaymentOut])
def list_payments(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv.payments


@router.post("/{invoice_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def record_payment(
    invoice_id: str,
    body: PaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status == InvoiceStatus.void:
        raise HTTPException(status_code=400, detail="Cannot record payment on a voided invoice")
    p = InvoicePayment(
        invoice_id=invoice_id,
        amount=body.amount,
        method=body.method,
        note=body.note,
        payment_date=body.payment_date,
        recorded_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    _apply_payment_and_maybe_mark_paid(inv, p, db, actor_id=current_user.id, actor_label=current_user.name)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    p = db.query(InvoicePayment).filter(InvoicePayment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(p)
    db.commit()


# ─── PDF (styled HTML, opened by browser print dialog) ───────────────────────

def _build_invoice_html(inv: Invoice) -> str:
    paid = round(float(sum(p.amount for p in inv.payments)), 2)
    balance = round(float(inv.total) - paid, 2)
    tax_pct = round(float(inv.tax_rate) * 100, 3)

    lines_html = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>{html_lib.escape(l.description)}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>{float(l.qty):g}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in inv.lines
    )
    payments_html = ""
    if inv.payments:
        rows = "".join(
            f"<tr><td style='padding:6px 12px'>{p.payment_date}</td>"
            f"<td style='padding:6px 12px'>{html_lib.escape(p.method) or '—'}</td>"
            f"<td style='padding:6px 12px;text-align:right'>${float(p.amount):,.2f}</td>"
            f"<td style='padding:6px 12px;color:#64748b'>{html_lib.escape(p.note)}</td></tr>"
            for p in inv.payments
        )
        payments_html = f"""
        <h3 style='margin:28px 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b'>Payments Received</h3>
        <table style='width:100%;border-collapse:collapse;font-size:13px;background:#f8fafc;border-radius:8px;overflow:hidden'>
          <thead><tr style='background:#e2e8f0'>
            <th style='padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase'>Date</th>
            <th style='padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase'>Method</th>
            <th style='padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase'>Amount</th>
            <th style='padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase'>Note</th>
          </tr></thead>
          <tbody>{rows}</tbody>
        </table>"""

    status_color = {"Draft": "#64748b", "Sent": "#1A5CBA", "Paid": "#059669", "Void": "#dc2626"}.get(str(inv.status), "#64748b")
    due_html = f"<p><strong>Due Date:</strong> {inv.due_date}</p>" if inv.due_date else ""
    client_name_safe = html_lib.escape(inv.client_name or "—")
    client_email_safe = html_lib.escape(inv.client_email)
    notes_safe = html_lib.escape(inv.notes)
    address_html = f"<p style='white-space:pre-line'>{html_lib.escape(inv.client_address)}</p>" if inv.client_address else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice {inv.id}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Inter',Arial,sans-serif;font-size:14px;color:#0f172a;background:#f1f5f9;padding:32px}}
  .page{{max-width:780px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.10);overflow:hidden}}
  .header{{background:#1A5CBA;color:#fff;padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}}
  .logo{{font-size:22px;font-weight:800;letter-spacing:-0.5px}}
  .logo span{{color:#E8A020}}
  .inv-id{{font-size:28px;font-weight:800;letter-spacing:-0.5px;opacity:0.95}}
  .body{{padding:28px 36px}}
  .meta{{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}}
  .meta-block p{{margin:3px 0;font-size:13px;color:#334155}}
  .meta-block strong{{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;display:block;margin-bottom:4px}}
  .badge{{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;color:#fff;background:{status_color}}}
  table{{width:100%;border-collapse:collapse;margin-top:4px}}
  thead th{{background:#f8fafc;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#64748b;border-bottom:2px solid #e2e8f0}}
  .totals{{margin-top:16px;display:flex;justify-content:flex-end}}
  .totals table{{width:260px}}
  .totals td{{padding:5px 12px;font-size:13px}}
  .totals .grand{{font-weight:700;font-size:15px;border-top:2px solid #0f172a}}
  .notes{{margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;font-size:13px;color:#334155;white-space:pre-wrap;border-left:3px solid #1A5CBA}}
  .footer{{background:#f1f5f9;padding:14px 36px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0}}
  @media print{{body{{background:#fff;padding:0}} .page{{box-shadow:none;border-radius:0}}}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">ATech<span>Solutions</span></div>
      <div style="font-size:12px;opacity:0.75;margin-top:4px">atechsolutions.org</div>
    </div>
    <div style="text-align:right">
      <div class="inv-id">{inv.id}</div>
      <div style="margin-top:6px"><span class="badge">{inv.status}</span></div>
    </div>
  </div>
  <div class="body">
    <div class="meta">
      <div class="meta-block">
        <strong>Bill To</strong>
        <p style="font-weight:600">{client_name_safe}</p>
        {f"<p>{client_email_safe}</p>" if inv.client_email else ""}
        {address_html}
      </div>
      <div class="meta-block">
        <strong>Invoice Details</strong>
        <p><strong>Issue Date:</strong> {inv.issue_date}</p>
        {due_html}
        {f"<p><strong>Tickets:</strong> {', '.join(t.id for t in inv.linked_tickets)}</p>" if inv.linked_tickets else (f"<p><strong>Ticket:</strong> {inv.ticket_id}</p>" if inv.ticket_id else "")}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:55%">Description</th>
          <th style="width:10%;text-align:center">Qty</th>
          <th style="width:17%;text-align:right">Unit Price</th>
          <th style="width:18%;text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>{lines_html}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${float(inv.subtotal):,.2f}</td></tr>
        {"" if tax_pct == 0 else f"<tr><td>Tax ({tax_pct}%)</td><td style='text-align:right'>${float(inv.tax_amount):,.2f}</td></tr>"}
        <tr class="grand"><td>Total</td><td style="text-align:right">${float(inv.total):,.2f}</td></tr>
        {f"<tr><td style='color:#059669'>Paid</td><td style='text-align:right;color:#059669'>-${paid:,.2f}</td></tr>" if paid > 0 else ""}
        {f"<tr><td style='font-weight:700'>Balance Due</td><td style='text-align:right;font-weight:700'>${balance:,.2f}</td></tr>" if paid > 0 else ""}
      </table>
    </div>

    {payments_html}

    {f'<div class="notes">{notes_safe}</div>' if inv.notes else ""}
  </div>
  <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org &nbsp;|&nbsp; Thank you for your business</div>
</div>
<script>window.onload = function(){{ window.print(); }}</script>
</body>
</html>"""
    return html


@router.get("/{invoice_id}/pdf", response_class=HTMLResponse)
def invoice_pdf(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return HTMLResponse(content=_build_invoice_html(inv))


# ─── Send invoice by email ────────────────────────────────────────────────────

class SendInvoiceIn(BaseModel):
    to: str = Field(..., max_length=255)
    message: str = Field("", max_length=2000)


def _send_invoice_email(inv: Invoice, to: str, message: str, db: Session) -> None:
    """Build and send the invoice HTML email, then mark Sent if still Draft.
    Shared by the manual send-invoice endpoint and the recurring-invoice
    auto-send path so the template/status-flip logic lives in one place."""
    paid = round(float(sum(p.amount for p in inv.payments)), 2)
    balance = round(float(inv.total) - paid, 2)
    tax_pct = round(float(inv.tax_rate) * 100, 3)

    lines_html = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{html_lib.escape(l.description)}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>{float(l.qty):g} × ${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in inv.lines
    )

    note_block = f"<div style='background:#f8fafc;border-left:3px solid #1A5CBA;padding:12px;border-radius:0 6px 6px 0;margin:16px 0;font-size:13px;white-space:pre-wrap'>{html_lib.escape(message)}</div>" if message else ""
    due_line = f"<p style='margin:4px 0'><strong>Due:</strong> {inv.due_date}</p>" if inv.due_date else ""
    client_display_safe = html_lib.escape(inv.client_name or to)

    html = f"""<!DOCTYPE html><html><head><style>
    body{{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#0f172a;background:#f4f7fc;margin:0;padding:0}}
    .wrap{{max-width:580px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}}
    .header{{background:#1A5CBA;padding:20px 28px;color:#fff}}
    .logo{{font-size:20px;font-weight:800}}.logo span{{color:#E8A020}}
    .body{{padding:24px 28px}}
    .footer{{background:#f4f7fc;padding:12px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}}
    </style></head><body>
    <div class="wrap">
      <div class="header"><div class="logo">ATech<span>Solutions</span></div></div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 8px">Invoice {inv.id}</p>
        <p style="margin:4px 0"><strong>To:</strong> {client_display_safe}</p>
        <p style="margin:4px 0"><strong>Issued:</strong> {inv.issue_date}</p>
        {due_line}
        {note_block}
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase">Description</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase">Qty × Price</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase">Amount</th>
          </tr></thead>
          <tbody>{lines_html}</tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">
          <tr><td style="padding:4px 10px">Subtotal</td><td style="text-align:right;padding:4px 10px">${float(inv.subtotal):,.2f}</td></tr>
          {"" if tax_pct == 0 else f"<tr><td style='padding:4px 10px'>Tax ({tax_pct}%)</td><td style='text-align:right;padding:4px 10px'>${float(inv.tax_amount):,.2f}</td></tr>"}
          <tr style="font-weight:700;font-size:15px;border-top:2px solid #0f172a">
            <td style="padding:6px 10px">Total</td><td style="text-align:right;padding:6px 10px">${float(inv.total):,.2f}</td>
          </tr>
          {f"<tr><td style='padding:4px 10px;color:#059669'>Paid</td><td style='text-align:right;padding:4px 10px;color:#059669'>-${paid:,.2f}</td></tr>" if paid > 0 else ""}
          {f"<tr style='font-weight:700'><td style='padding:4px 10px'>Balance Due</td><td style='text-align:right;padding:4px 10px'>${balance:,.2f}</td></tr>" if paid > 0 else ""}
        </table>
      </div>
      <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
    </div></body></html>"""

    mail._send(to, f"Invoice {inv.id} from ATechSolutions", html)
    # mark as Sent if still Draft
    if inv.status == InvoiceStatus.draft:
        inv.status = InvoiceStatus.sent
        db.commit()


@router.post("/{invoice_id}/send", status_code=status.HTTP_204_NO_CONTENT)
def send_invoice(
    invoice_id: str,
    body: SendInvoiceIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _send_invoice_email(inv, body.to, body.message, db)
