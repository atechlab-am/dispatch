from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Invoice, InvoiceLine, InvoicePayment, InvoiceStatus, User
from ..security import get_current_user
from .. import email as mail

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
    recorded_by: int
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


def _enrich(inv: Invoice) -> dict:
    """Return InvoiceOut dict with computed amount_paid and balance."""
    data = InvoiceOut.model_validate(inv).model_dump()
    paid = float(sum(p.amount for p in inv.payments))
    data["amount_paid"] = round(paid, 2)
    data["balance"] = round(float(inv.total) - paid, 2)
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
    _: User = Depends(get_current_user),
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
    db.commit()
    db.refresh(inv)
    return _enrich(inv)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(inv)
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
    db.add(p)
    db.flush()
    # auto-mark paid when balance reaches zero
    paid = float(sum(float(px.amount) for px in inv.payments)) + float(body.amount)
    if paid >= float(inv.total):
        inv.status = InvoiceStatus.paid
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
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>{l.description}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>{float(l.qty):g}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in inv.lines
    )
    payments_html = ""
    if inv.payments:
        rows = "".join(
            f"<tr><td style='padding:6px 12px'>{p.payment_date}</td>"
            f"<td style='padding:6px 12px'>{p.method or '—'}</td>"
            f"<td style='padding:6px 12px;text-align:right'>${float(p.amount):,.2f}</td>"
            f"<td style='padding:6px 12px;color:#64748b'>{p.note or ''}</td></tr>"
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
    address_html = f"<p style='white-space:pre-line'>{inv.client_address}</p>" if inv.client_address else ""

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
        <p style="font-weight:600">{inv.client_name or '—'}</p>
        {f"<p>{inv.client_email}</p>" if inv.client_email else ""}
        {address_html}
      </div>
      <div class="meta-block">
        <strong>Invoice Details</strong>
        <p><strong>Issue Date:</strong> {inv.issue_date}</p>
        {due_html}
        {f"<p><strong>Ticket:</strong> {inv.ticket_id}</p>" if inv.ticket_id else ""}
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

    {f'<div class="notes">{inv.notes}</div>' if inv.notes else ""}
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

    paid = round(float(sum(p.amount for p in inv.payments)), 2)
    balance = round(float(inv.total) - paid, 2)
    tax_pct = round(float(inv.tax_rate) * 100, 3)

    lines_html = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{l.description}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>{float(l.qty):g} × ${float(l.unit_price):,.2f}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>${float(l.amount):,.2f}</td></tr>"
        for l in inv.lines
    )

    note_block = f"<div style='background:#f8fafc;border-left:3px solid #1A5CBA;padding:12px;border-radius:0 6px 6px 0;margin:16px 0;font-size:13px;white-space:pre-wrap'>{body.message}</div>" if body.message else ""
    due_line = f"<p style='margin:4px 0'><strong>Due:</strong> {inv.due_date}</p>" if inv.due_date else ""

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
        <p style="margin:4px 0"><strong>To:</strong> {inv.client_name or body.to}</p>
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

    mail._send(body.to, f"Invoice {inv.id} from ATechSolutions", html)
    # mark as Sent if still Draft
    if inv.status == InvoiceStatus.draft:
        inv.status = InvoiceStatus.sent
        db.commit()
