from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Client, ClientType, Invoice, InvoicePayment
from ..security import get_current_user

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

    model_config = {"from_attributes": True}


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

    if body.slug:
        existing = db.query(Client).filter(Client.slug == body.slug).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' is already in use by another client")

    client = Client(
        name=body.name, email=body.email, phone=body.phone,
        address=body.address, client_type=ct, company=body.company,
        notes=body.notes, slug=body.slug,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


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
