from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Invoice, InvoiceLine, InvoiceStatus, User
from ..security import get_current_user

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
    return inv


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


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
    return inv


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(inv)
    db.commit()
