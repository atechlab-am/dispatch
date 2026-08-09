from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Client, ClientType, ClientSlaTier, Invoice, InvoicePayment, RecurringTicket, Ticket, TicketStatus
from ..security import get_current_user
from .. import config

router = APIRouter(prefix="/clients", tags=["clients"])


import re as _re

_SLUG_RE = _re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


class ClientIn(BaseModel):
    name: str = Field(..., max_length=255)
    email: str = Field("", max_length=255)
    phone: str = Field("", max_length=50)
    address: str = Field("", max_length=500)
    client_type: str = "business"
    company: str = Field("", max_length=255)
    notes: str = Field("", max_length=5000)
    slug: Optional[str] = Field(None, max_length=100)
    sla_tier: Optional[str] = None

    @field_validator("slug", mode="before")
    @classmethod
    def validate_slug(cls, v):
        if v and not _SLUG_RE.match(v):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only (e.g. acme-corp)")
        return v or None


class ClientOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    address: str
    client_type: str
    company: str
    notes: str
    slug: Optional[str] = None
    sla_tier: Optional[str] = None

    model_config = {"from_attributes": True}


def _validate_tier(sla_tier: Optional[str]) -> Optional[str]:
    """Validate an incoming sla_tier value. Ignored (returns None) when the
    feature is disabled, so the column never holds a tier that has no effect."""
    if not sla_tier or not config.FEATURE_SLA_TIERS:
        return None
    try:
        return ClientSlaTier(sla_tier).value
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid sla_tier: {sla_tier}")


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return db.query(Client).order_by(Client.name).all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    body: ClientIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        ct = ClientType(body.client_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid client_type: {body.client_type}")

    tier = _validate_tier(body.sla_tier)

    if body.slug:
        existing = db.query(Client).filter(Client.slug == body.slug).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' is already in use by another client")

    client = Client(
        name=body.name, email=body.email, phone=body.phone,
        address=body.address, client_type=ct, company=body.company,
        notes=body.notes, slug=body.slug, sla_tier=tier,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


# ─── Company summary (ticket/invoice counts across every contact in a company) ─
# Declared before /{client_id} so this literal path segment isn't swallowed by
# the int path-param route (FastAPI resolves routes in declaration order and
# does not fall through to the next route on a param-coercion failure).

_TICKET_OPEN_STATUSES = [TicketStatus.open, TicketStatus.in_progress, TicketStatus.awaiting_client, TicketStatus.on_hold]


class CompanySummaryOut(BaseModel):
    ticket_count: int
    open_ticket_count: int
    invoice_count: int
    total_billed: float
    total_paid: float
    outstanding: float


@router.get("/company-summary", response_model=CompanySummaryOut)
def company_summary(
    company: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Aggregate ticket/invoice counts across every contact record that shares
    this company name — a business's tickets/invoices can be attached to any
    of its contacts' client_id, not just the primary record."""
    client_ids = [c.id for c in db.query(Client.id).filter(Client.company == company).all()]
    if not client_ids:
        return CompanySummaryOut(ticket_count=0, open_ticket_count=0, invoice_count=0, total_billed=0, total_paid=0, outstanding=0)

    tickets = db.query(Ticket).filter(Ticket.client_id.in_(client_ids)).all()
    ticket_count = len(tickets)
    open_ticket_count = sum(1 for t in tickets if t.status in _TICKET_OPEN_STATUSES)

    invoices = db.query(Invoice).filter(Invoice.client_id.in_(client_ids), Invoice.status != "Void").all()
    total_billed = round(sum(float(inv.total) for inv in invoices), 2)
    total_paid = round(sum(float(p.amount) for inv in invoices for p in inv.payments), 2)

    return CompanySummaryOut(
        ticket_count=ticket_count,
        open_ticket_count=open_ticket_count,
        invoice_count=len(invoices),
        total_billed=total_billed,
        total_paid=total_paid,
        outstanding=round(total_billed - total_paid, 2),
    )


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.put("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    body: ClientIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    try:
        ct = ClientType(body.client_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid client_type: {body.client_type}")

    tier = _validate_tier(body.sla_tier)

    if body.slug:
        existing = db.query(Client).filter(Client.slug == body.slug, Client.id != client_id).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' is already in use by another client")

    client.name = body.name
    client.email = body.email
    client.phone = body.phone
    client.address = body.address
    client.client_type = ct
    client.company = body.company
    client.notes = body.notes
    client.slug = body.slug
    client.sla_tier = tier
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    # Detach references that have no ORM cascade so the FK delete can't fail.
    # Tickets are nulled automatically via the Client.tickets relationship, but
    # recurring tickets have no relationship on Client, so null them explicitly.
    db.query(RecurringTicket).filter(RecurringTicket.client_id == client_id).update(
        {"client_id": None}, synchronize_session=False
    )
    db.delete(client)
    db.commit()


# ─── Client statement ─────────────────────────────────────────────────────────

class StatementInvoice(BaseModel):
    id: str
    issue_date: date
    due_date: Optional[date]
    status: str
    total: float
    amount_paid: float
    balance: float
    model_config = {"from_attributes": True}


class StatementOut(BaseModel):
    client: ClientOut
    invoices: list[StatementInvoice]
    total_billed: float
    total_paid: float
    outstanding: float


@router.get("/{client_id}/statement", response_model=StatementOut)
def client_statement(
    client_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    invoices = (
        db.query(Invoice)
        .filter(Invoice.client_id == client_id)
        .order_by(Invoice.issue_date.desc())
        .all()
    )

    items = []
    total_billed = 0.0
    total_paid = 0.0
    for inv in invoices:
        if str(inv.status) == "Void":
            continue
        paid = float(sum(p.amount for p in inv.payments))
        total_billed += float(inv.total)
        total_paid += paid
        items.append(StatementInvoice(
            id=inv.id,
            issue_date=inv.issue_date,
            due_date=inv.due_date,
            status=str(inv.status),
            total=float(inv.total),
            amount_paid=round(paid, 2),
            balance=round(float(inv.total) - paid, 2),
        ))

    return StatementOut(
        client=ClientOut.model_validate(client),
        invoices=items,
        total_billed=round(total_billed, 2),
        total_paid=round(total_paid, 2),
        outstanding=round(total_billed - total_paid, 2),
    )
