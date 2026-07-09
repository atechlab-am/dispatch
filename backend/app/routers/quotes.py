import html as html_lib
import sys
from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import (
    Quote, QuoteLine, QuoteLineType, QuoteStatus, Invoice, InvoiceLine, InvoiceStatus, User,
    Ticket, HourLog, TicketType, TicketStatus, TicketPriority, ClientType, TravelFee,
)
from ..security import get_current_user
from .. import email as mail
from ..audit import write_audit
from .. import config

router = APIRouter(prefix="/quotes", tags=["quotes"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class QuoteLineIn(BaseModel):
    description: str = Field("", max_length=500)
    item_type: QuoteLineType = QuoteLineType.labor
    qty: float = 1
    unit_price: float = 0
    amount: float = 0


class QuoteLineOut(BaseModel):
    id: int
    description: str
    item_type: QuoteLineType
    qty: float
    unit_price: float
    amount: float
    model_config = {"from_attributes": True}


class QuoteIn(BaseModel):
    ticket_id: Optional[str] = None
    client_id: Optional[int] = None
    client_name: str = Field("", max_length=255)
    client_email: str = Field("", max_length=255)
    client_address: str = Field("", max_length=1000)
    project_name: str = Field("", max_length=255)
    issue_date: date = Field(default_factory=date.today)
    expiry_date: Optional[date] = None
    notes: str = Field("", max_length=5000)
    tax_rate: float = 0
    lines: list[QuoteLineIn] = Field(default=[], max_length=200)


class QuoteOut(BaseModel):
    id: str
    ticket_id: Optional[str]
    client_id: Optional[int]
    client_name: str
    client_email: str
    client_address: str
    project_name: str
    project_id: Optional[str] = None
    status: QuoteStatus
    issue_date: date
    expiry_date: Optional[date]
    notes: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    created_at: datetime
    updated_at: datetime
    created_by: int
    converted_invoice_id: Optional[str]
    lines: list[QuoteLineOut] = []
    model_config = {"from_attributes": True}


class QuoteListItem(BaseModel):
    id: str
    client_name: str
    project_name: str
    status: QuoteStatus
    issue_date: date
    expiry_date: Optional[date]
    total: float
    created_at: datetime
    model_config = {"from_attributes": True}


class QuotesPage(BaseModel):
    items: list[QuoteListItem]
    total: int
    page: int
    page_size: int


# Status transitions allowed via PATCH /quotes/{id}/status. Draft is the only
# entry state; approved/rejected/expired are terminal (no further transition).
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    QuoteStatus.draft: {QuoteStatus.sent, QuoteStatus.rejected},
    QuoteStatus.sent: {QuoteStatus.approved, QuoteStatus.rejected, QuoteStatus.expired},
    QuoteStatus.approved: set(),
    QuoteStatus.rejected: set(),
    QuoteStatus.expired: set(),
}


class StatusIn(BaseModel):
    status: QuoteStatus


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _require_quotes_enabled():
    if not config.FEATURE_QUOTES:
        raise HTTPException(status_code=503, detail="This feature is disabled")


def _make_quote_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"QUO-{year}-"
    last = (
        db.query(Quote)
        .filter(Quote.id.like(f"{prefix}%"))
        .order_by(Quote.id.desc())
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.id.replace(prefix, "")) + 1
        except ValueError:
            pass
    return f"{prefix}{n:05d}"


def _compute_totals(lines: list[QuoteLineIn], tax_rate: float):
    subtotal = sum(l.amount for l in lines)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax_amount, 2)
    return round(subtotal, 2), tax_amount, total


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", response_model=QuotesPage)
def list_quotes(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    ticket_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_quotes_enabled()
    q = db.query(Quote)
    if status_filter and status_filter != "All":
        q = q.filter(Quote.status == status_filter)
    if ticket_id:
        q = q.filter(Quote.ticket_id == ticket_id)
    total = q.count()
    items = q.order_by(Quote.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return QuotesPage(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
def create_quote(
    body: QuoteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_quotes_enabled()
    subtotal, tax_amount, total = _compute_totals(body.lines, body.tax_rate)
    now = datetime.now(timezone.utc)
    q = Quote(
        id=_make_quote_id(db),
        ticket_id=body.ticket_id,
        client_id=body.client_id,
        client_name=body.client_name,
        client_email=body.client_email,
        client_address=body.client_address,
        project_name=body.project_name,
        status=QuoteStatus.draft,
        issue_date=body.issue_date,
        expiry_date=body.expiry_date,
        notes=body.notes,
        subtotal=subtotal,
        tax_rate=body.tax_rate,
        tax_amount=tax_amount,
        total=total,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(q)
    db.flush()
    for l in body.lines:
        db.add(QuoteLine(quote_id=q.id, description=l.description, item_type=l.item_type, qty=l.qty, unit_price=l.unit_price, amount=l.amount))
    db.commit()
    db.refresh(q)
    return q


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(
    quote_id: str,
    body: QuoteIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status != QuoteStatus.draft:
        raise HTTPException(status_code=400, detail="Only Draft quotes can be edited")

    subtotal, tax_amount, total = _compute_totals(body.lines, body.tax_rate)
    q.ticket_id = body.ticket_id
    q.client_id = body.client_id
    q.client_name = body.client_name
    q.client_email = body.client_email
    q.client_address = body.client_address
    q.project_name = body.project_name
    q.issue_date = body.issue_date
    q.expiry_date = body.expiry_date
    q.notes = body.notes
    q.tax_rate = body.tax_rate
    q.subtotal = subtotal
    q.tax_amount = tax_amount
    q.total = total
    q.updated_at = datetime.now(timezone.utc)

    db.query(QuoteLine).filter(QuoteLine.quote_id == quote_id).delete()
    db.flush()
    for l in body.lines:
        db.add(QuoteLine(quote_id=q.id, description=l.description, item_type=l.item_type, qty=l.qty, unit_price=l.unit_price, amount=l.amount))
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(quote_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    db.delete(q)
    db.commit()


def _make_ticket_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"TKT-{year}-"
    last = (
        db.query(Ticket)
        .filter(Ticket.id.like(f"{prefix}%"))
        .order_by(Ticket.id.desc())
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.id.replace(prefix, "")) + 1
        except ValueError:
            pass
    return f"{prefix}{n:05d}"


def _auto_create_ticket_from_quote(db: Session, q: Quote, current_user: User):
    """Approving a quote spins up the work order automatically. This is a
    derived side effect of the approval the user actually requested, so a
    failure here must never block or roll back the quote's own status
    change — caught, logged, and the quote still reaches Approved."""
    try:
        now = datetime.now(timezone.utc)
        ticket = Ticket(
            id=_make_ticket_id(db),
            ticket_type=TicketType.request,
            status=TicketStatus.open,
            priority=TicketPriority.medium,
            client_type=ClientType.business,
            client_id=q.client_id,
            client_name=q.client_name,
            client_email=q.client_email,
            client_address=q.client_address,
            title=f"{q.project_name} — Quote {q.id} approved" if q.project_name else f"Quote {q.id} approved — work order",
            description=q.notes,
            travel_fee=TravelFee.none,
            created_at=now,
            updated_at=now,
            created_by=current_user.id,
        )
        db.add(ticket)
        db.flush()
        for line in q.lines:
            db.add(HourLog(
                ticket_id=ticket.id,
                date=date.today(),
                hours=1,
                rate=line.amount,
                description=f"[{line.item_type}] {line.description}",
            ))
        write_audit(db, ticket_id=ticket.id, actor_id=current_user.id, actor_label=current_user.name,
                    action="created", field="quote", new_value=q.id)
        q.ticket_id = ticket.id
    except Exception as e:
        db.rollback()
        q.status = QuoteStatus.approved
        q.updated_at = datetime.now(timezone.utc)
        print(f"[quote-ticket-autocreate] failed for {q.id}: {e}", file=sys.stderr)


@router.patch("/{quote_id}/status", response_model=QuoteOut)
def update_quote_status(
    quote_id: str,
    body: StatusIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    allowed = _ALLOWED_TRANSITIONS.get(q.status, set())
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot move quote from {q.status} to {body.status}")
    q.status = body.status
    q.updated_at = datetime.now(timezone.utc)
    if body.status == QuoteStatus.approved and not q.ticket_id:
        _auto_create_ticket_from_quote(db, q, current_user)
    db.commit()
    db.refresh(q)
    return q


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


@router.post("/{quote_id}/convert", status_code=status.HTTP_201_CREATED)
def convert_quote_to_invoice(
    quote_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approved quotes only — creates an Invoice copying the quote's client/lines/tax,
    marks the quote converted, and logs the creation on the resulting invoice's audit
    trail (quotes have no audit trail of their own)."""
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status != QuoteStatus.approved:
        raise HTTPException(status_code=400, detail="Only Approved quotes can be converted to an invoice")
    if q.converted_invoice_id:
        raise HTTPException(status_code=400, detail="Quote was already converted to an invoice")

    now = datetime.now(timezone.utc)
    inv = Invoice(
        id=_make_invoice_id(db),
        ticket_id=q.ticket_id,
        client_id=q.client_id,
        client_name=q.client_name,
        client_email=q.client_email,
        client_address=q.client_address,
        status=InvoiceStatus.draft,
        issue_date=date.today(),
        notes=q.notes,
        subtotal=q.subtotal,
        tax_rate=q.tax_rate,
        tax_amount=q.tax_amount,
        total=q.total,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(inv)
    db.flush()
    for l in q.lines:
        db.add(InvoiceLine(invoice_id=inv.id, description=l.description, qty=l.qty, unit_price=l.unit_price, amount=l.amount))
    q.converted_invoice_id = inv.id
    write_audit(db, invoice_id=inv.id, actor_id=current_user.id, actor_label=current_user.name,
                action="created", field="quote", new_value=q.id)
    db.commit()
    db.refresh(inv)
    return {"invoice_id": inv.id}


# ─── PDF (styled HTML, opened by browser print dialog) ───────────────────────

def _build_quote_html(q: Quote) -> str:
    tax_pct = round(float(q.tax_rate) * 100, 3)
    lines_html = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>{html_lib.escape(l.description)}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>{float(l.qty):g}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in q.lines
    )
    status_color = {"Draft": "#64748b", "Sent": "#1A5CBA", "Approved": "#059669", "Rejected": "#dc2626", "Expired": "#94a3b8"}.get(str(q.status), "#64748b")
    expiry_html = f"<p><strong>Expires:</strong> {q.expiry_date}</p>" if q.expiry_date else ""
    client_name_safe = html_lib.escape(q.client_name or "—")
    client_email_safe = html_lib.escape(q.client_email)
    project_name_html = f"<p><strong>Project:</strong> {html_lib.escape(q.project_name)}</p>" if q.project_name else ""
    notes_safe = html_lib.escape(q.notes)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quote {q.id}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:Arial,sans-serif;font-size:14px;color:#0f172a;background:#f1f5f9;padding:32px}}
  .page{{max-width:780px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.10);overflow:hidden}}
  .header{{background:#1A5CBA;color:#fff;padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}}
  .logo{{font-size:22px;font-weight:800;letter-spacing:-0.5px}}
  .logo span{{color:#E8A020}}
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
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;opacity:0.95">{q.id}</div>
      <div style="margin-top:6px"><span class="badge">{q.status}</span></div>
    </div>
  </div>
  <div class="body">
    <div class="meta">
      <div class="meta-block">
        <strong>Quote For</strong>
        <p style="font-weight:600">{client_name_safe}</p>
        {f"<p>{client_email_safe}</p>" if q.client_email else ""}
      </div>
      <div class="meta-block">
        <strong>Quote Details</strong>
        {project_name_html}
        <p><strong>Issue Date:</strong> {q.issue_date}</p>
        {expiry_html}
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
        <tr><td>Subtotal</td><td style="text-align:right">${float(q.subtotal):,.2f}</td></tr>
        {"" if tax_pct == 0 else f"<tr><td>Tax ({tax_pct}%)</td><td style='text-align:right'>${float(q.tax_amount):,.2f}</td></tr>"}
        <tr class="grand"><td>Total</td><td style="text-align:right">${float(q.total):,.2f}</td></tr>
      </table>
    </div>
    {f'<div class="notes">{notes_safe}</div>' if q.notes else ""}
  </div>
  <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
</div>
<script>window.onload = function(){{ window.print(); }}</script>
</body>
</html>"""
    return html


@router.get("/{quote_id}/pdf", response_class=HTMLResponse)
def quote_pdf(quote_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return HTMLResponse(content=_build_quote_html(q))


# ─── Send quote by email ──────────────────────────────────────────────────────

class SendQuoteIn(BaseModel):
    to: str = Field(..., max_length=255)
    message: str = Field("", max_length=2000)


@router.post("/{quote_id}/send", status_code=status.HTTP_204_NO_CONTENT)
def send_quote(
    quote_id: str,
    body: SendQuoteIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_quotes_enabled()
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in (QuoteStatus.draft, QuoteStatus.sent):
        raise HTTPException(status_code=400, detail=f"Cannot send a quote in {q.status} status")

    tax_pct = round(float(q.tax_rate) * 100, 3)
    lines_html = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{html_lib.escape(l.description)}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>{float(l.qty):g} × ${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in q.lines
    )
    note_block = f"<div style='background:#f8fafc;border-left:3px solid #1A5CBA;padding:12px;border-radius:0 6px 6px 0;margin:16px 0;font-size:13px;white-space:pre-wrap'>{html_lib.escape(body.message)}</div>" if body.message else ""
    expiry_line = f"<p style='margin:4px 0'><strong>Expires:</strong> {q.expiry_date}</p>" if q.expiry_date else ""
    project_line = f"<p style='margin:4px 0'><strong>Project:</strong> {html_lib.escape(q.project_name)}</p>" if q.project_name else ""
    client_display_safe = html_lib.escape(q.client_name or body.to)

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
        <p style="font-size:16px;font-weight:700;margin:0 0 8px">Quote {q.id}</p>
        <p style="margin:4px 0"><strong>To:</strong> {client_display_safe}</p>
        {project_line}
        <p style="margin:4px 0"><strong>Issued:</strong> {q.issue_date}</p>
        {expiry_line}
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
          <tr><td style="padding:4px 10px">Subtotal</td><td style="text-align:right;padding:4px 10px">${float(q.subtotal):,.2f}</td></tr>
          {"" if tax_pct == 0 else f"<tr><td style='padding:4px 10px'>Tax ({tax_pct}%)</td><td style='text-align:right;padding:4px 10px'>${float(q.tax_amount):,.2f}</td></tr>"}
          <tr style="font-weight:700;font-size:15px;border-top:2px solid #0f172a">
            <td style="padding:6px 10px">Total</td><td style="text-align:right;padding:6px 10px">${float(q.total):,.2f}</td>
          </tr>
        </table>
      </div>
      <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
    </div></body></html>"""

    mail._send(body.to, f"Quote {q.id} from ATechSolutions", html)
    if q.status == QuoteStatus.draft:
        q.status = QuoteStatus.sent
        q.updated_at = datetime.now(timezone.utc)
        db.commit()
