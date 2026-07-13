"""Client portal — auth + read-only ticket/invoice access for client accounts."""
from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import (
    Client, ClientPortalUser, PortalRefreshToken,
    Ticket, TicketStatus, Invoice, InvoiceStatus,
)
from ..schemas import TokenOut, RefreshIn
from ..security import (
    hash_password, verify_password,
    create_portal_access_token, create_refresh_token, hash_token,
    get_portal_user, get_current_user, require_admin,
)
from ..models.models import User

router = APIRouter(prefix="/portal", tags=["portal"])
_limiter = Limiter(key_func=get_remote_address)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PortalLoginIn(BaseModel):
    email: EmailStr
    password: str
    slug: Optional[str] = None  # when present, validates the account belongs to that client


class PortalUserOut(BaseModel):
    id: int
    client_id: int
    email: str
    name: str
    active: bool
    must_change_password: bool = True
    model_config = {"from_attributes": True}


class PortalChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class PortalAccountIn(BaseModel):
    client_id: int
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class PortalAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    active: Optional[bool] = None


class PortalTicketListItem(BaseModel):
    id: str
    ticket_type: str
    status: str
    priority: str
    title: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PortalTicketOut(BaseModel):
    id: str
    ticket_type: str
    status: str
    priority: str
    title: str
    description: str
    created_at: datetime
    updated_at: datetime
    sla_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None
    model_config = {"from_attributes": True}


class PortalTicketIn(BaseModel):
    ticket_type: str = Field("Incident", max_length=50)
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field("", max_length=20000)
    priority: str = Field("Medium", max_length=20)


class PortalInvoiceListItem(BaseModel):
    id: str
    status: str
    issue_date: date
    due_date: Optional[date]
    total: float
    amount_paid: float
    balance: float
    created_at: datetime
    model_config = {"from_attributes": True}


class PortalInvoiceOut(BaseModel):
    id: str
    status: str
    issue_date: date
    due_date: Optional[date]
    notes: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    amount_paid: float
    balance: float
    created_at: datetime
    lines: list[dict] = []
    model_config = {"from_attributes": True}


# ─── Auth ─────────────────────────────────────────────────────────────────────

class ClientSlugOut(BaseModel):
    id: int
    name: str
    slug: str
    member_ids: list[int] = []
    model_config = {"from_attributes": True}


@router.get("/slug/{slug}", response_model=ClientSlugOut)
def get_client_by_slug(slug: str, db: Session = Depends(get_db)):
    """Public endpoint — returns client name for a slug so the login page can display it."""
    client = db.query(Client).filter(Client.slug == slug).first()
    if not client:
        raise HTTPException(status_code=404, detail="Portal not found")
    if client.company:
        member_ids = [r.id for r in db.query(Client.id).filter(Client.company == client.company).all()]
    else:
        member_ids = [client.id]
    return {**{c: getattr(client, c) for c in ("id", "name", "slug")}, "member_ids": member_ids}


@router.post("/auth/login", response_model=TokenOut)
@_limiter.limit("10/minute")
def portal_login(request: Request, body: PortalLoginIn, db: Session = Depends(get_db)):
    # If a slug is provided, resolve it to the full company group and scope the lookup
    client_id_filter = None
    if body.slug:
        slug_client = db.query(Client).filter(Client.slug == body.slug).first()
        if not slug_client:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
        # Include all members of the company group (slug is on primary, but portal users
        # may have client_id pointing to their own contact record within the group)
        if slug_client.company:
            client_id_filter = [r.id for r in db.query(Client.id).filter(Client.company == slug_client.company).all()]
        else:
            client_id_filter = [slug_client.id]

    q = db.query(ClientPortalUser).filter(
        ClientPortalUser.email == body.email,
        ClientPortalUser.active == True,
    )
    if client_id_filter is not None:
        q = q.filter(ClientPortalUser.client_id.in_(client_id_filter))
    pu = q.first()

    if not pu or not verify_password(body.password, pu.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access = create_portal_access_token(pu.id)
    raw_refresh, expires_at = create_refresh_token(pu.id)
    db.add(PortalRefreshToken(
        token_hash=hash_token(raw_refresh),
        portal_user_id=pu.id,
        expires_at=expires_at,
    ))
    db.commit()
    return TokenOut(access_token=access, refresh_token=raw_refresh)


@router.post("/auth/refresh", response_model=TokenOut)
@_limiter.limit("30/minute")
def portal_refresh(request: Request, body: RefreshIn, db: Session = Depends(get_db)):
    token_hash = hash_token(body.refresh_token)
    now = datetime.now(timezone.utc)

    record = db.query(PortalRefreshToken).filter(
        PortalRefreshToken.token_hash == token_hash,
        PortalRefreshToken.expires_at > now,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    pu = db.query(ClientPortalUser).filter(
        ClientPortalUser.id == record.portal_user_id,
        ClientPortalUser.active == True,
    ).first()
    if not pu:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    db.delete(record)
    access = create_portal_access_token(pu.id)
    raw_refresh, expires_at = create_refresh_token(pu.id)
    db.add(PortalRefreshToken(
        token_hash=hash_token(raw_refresh),
        portal_user_id=pu.id,
        expires_at=expires_at,
    ))
    db.commit()
    return TokenOut(access_token=access, refresh_token=raw_refresh)


@router.post("/auth/logout")
def portal_logout(
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    db.query(PortalRefreshToken).filter(PortalRefreshToken.portal_user_id == pu.id).delete()
    db.commit()
    return {"ok": True}


@router.get("/auth/me", response_model=PortalUserOut)
def portal_me(pu: ClientPortalUser = Depends(get_portal_user)):
    return pu


@router.post("/auth/change-password", response_model=PortalUserOut)
def portal_change_password(
    body: PortalChangePasswordIn,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, pu.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")
    pu.password_hash = hash_password(body.new_password)
    pu.must_change_password = False
    db.commit()
    db.refresh(pu)
    return pu


# ─── Tickets ──────────────────────────────────────────────────────────────────

VALID_TYPES = {"Incident", "Request", "Change Request"}
VALID_PRIORITIES = {"Low", "Medium", "High", "Urgent"}


def _company_client_ids(db: Session, pu: ClientPortalUser) -> list[int]:
    """Return all client IDs in the same company group as the portal user's client.
    The portal user is always scoped to the primary record (lowest id with the slug),
    but tickets may be filed against any contact in the group."""
    primary = db.query(Client).filter(Client.id == pu.client_id).first()
    if not primary:
        return [pu.client_id]
    if primary.company:
        siblings = db.query(Client.id).filter(Client.company == primary.company).all()
        return [r.id for r in siblings]
    return [pu.client_id]


@router.get("/tickets", response_model=list[PortalTicketListItem])
def portal_list_tickets(
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    client_ids = _company_client_ids(db, pu)
    tickets = (
        db.query(Ticket)
        .filter(Ticket.client_id.in_(client_ids))
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return tickets


@router.get("/tickets/{ticket_id}", response_model=PortalTicketOut)
def portal_get_ticket(
    ticket_id: str,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    client_ids = _company_client_ids(db, pu)
    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.client_id.in_(client_ids),
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.post("/tickets", response_model=PortalTicketOut, status_code=201)
def portal_create_ticket(
    body: PortalTicketIn,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    from ..routers.tickets import _make_ticket_id, _sla_deadlines
    from ..models.models import TicketType, TicketPriority, ClientType, TravelFee

    ticket_type = body.ticket_type if body.ticket_type in VALID_TYPES else "Incident"
    priority = body.priority if body.priority in VALID_PRIORITIES else "Medium"

    # Resolve the contact record and the company's primary record (lowest id in group)
    contact_rec = db.query(Client).filter(Client.id == pu.client_id).first()
    if contact_rec and contact_rec.company:
        primary = (
            db.query(Client)
            .filter(Client.company == contact_rec.company)
            .order_by(Client.id)
            .first()
        )
    else:
        primary = contact_rec

    now = datetime.now(timezone.utc)
    response_due, resolution_due = _sla_deadlines(priority, now)

    from ..models.models import User as StaffUser, UserRole
    admin = db.query(StaffUser).filter(StaffUser.role == UserRole.admin, StaffUser.active == True).first()
    if not admin:
        raise HTTPException(status_code=500, detail="No admin user available to assign ticket")

    # client_name: "Company — Portal User" so staff can see who submitted it
    company_name = (primary.company or primary.name) if primary else ""
    display_name = f"{company_name} — {pu.name}" if company_name and pu.name != company_name else (pu.name or company_name)

    ticket = Ticket(
        id=_make_ticket_id(db),
        ticket_type=ticket_type,
        status=TicketStatus.open,
        priority=priority,
        client_type=primary.client_type if primary else ClientType.business,
        client_id=pu.client_id,
        client_name=display_name,
        client_email=pu.email,
        client_phone=primary.phone if primary else "",
        client_address=primary.address if primary else "",
        title=body.title,
        description=body.description,
        internal_notes="",
        travel_fee=TravelFee.none,
        created_by=admin.id,
        sla_response_due=response_due,
        sla_resolution_due=resolution_due,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


# ─── Invoices ─────────────────────────────────────────────────────────────────

def _invoice_out(inv: Invoice) -> dict:
    paid = float(sum(p.amount for p in inv.payments))
    return {
        "id": inv.id,
        "status": inv.status,
        "issue_date": inv.issue_date,
        "due_date": inv.due_date,
        "notes": inv.notes,
        "subtotal": float(inv.subtotal),
        "tax_rate": float(inv.tax_rate),
        "tax_amount": float(inv.tax_amount),
        "total": float(inv.total),
        "amount_paid": round(paid, 2),
        "balance": round(float(inv.total) - paid, 2),
        "created_at": inv.created_at,
        "lines": [
            {
                "id": l.id,
                "description": l.description,
                "qty": float(l.qty),
                "unit_price": float(l.unit_price),
                "amount": float(l.amount),
            }
            for l in inv.lines
        ],
    }


@router.get("/invoices", response_model=list[PortalInvoiceListItem])
def portal_list_invoices(
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    client_ids = _company_client_ids(db, pu)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.client_id.in_(client_ids), Invoice.status.notin_([InvoiceStatus.draft, InvoiceStatus.void]))
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return [_invoice_out(inv) for inv in invoices]


@router.get("/invoices/{invoice_id}", response_model=PortalInvoiceOut)
def portal_get_invoice(
    invoice_id: str,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    client_ids = _company_client_ids(db, pu)
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.client_id.in_(client_ids),
        Invoice.status != InvoiceStatus.draft,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_out(inv)


@router.get("/invoices/{invoice_id}/pdf", response_class=HTMLResponse)
def portal_invoice_pdf(
    invoice_id: str,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    from ..routers.invoices import _build_invoice_html
    client_ids = _company_client_ids(db, pu)
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.client_id.in_(client_ids),
        Invoice.status != InvoiceStatus.draft,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return HTMLResponse(content=_build_invoice_html(inv))


class CheckoutSessionOut(BaseModel):
    checkout_url: str


@router.post("/invoices/{invoice_id}/checkout", response_model=CheckoutSessionOut)
def portal_create_checkout_session(
    invoice_id: str,
    pu: ClientPortalUser = Depends(get_portal_user),
    db: Session = Depends(get_db),
):
    from .. import config
    import stripe

    if not config.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Online payments are not configured")

    client_ids = _company_client_ids(db, pu)
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.client_id.in_(client_ids),
        Invoice.status != InvoiceStatus.draft,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status in (InvoiceStatus.paid, InvoiceStatus.void):
        raise HTTPException(status_code=400, detail="This invoice cannot be paid online")

    paid = float(sum(p.amount for p in inv.payments))
    balance = round(float(inv.total) - paid, 2)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This invoice has no outstanding balance")

    # The slug lives on whichever client record in the company actually has one set
    # (usually the primary/lowest-id record) — pu.client_id may be a secondary contact.
    slug = (
        db.query(Client.slug)
        .filter(Client.id.in_(client_ids), Client.slug.isnot(None))
        .scalar()
        or ""
    )
    return_url = f"{config.PORTAL_URL}/p/{slug}/invoices/{inv.id}"

    stripe.api_key = config.STRIPE_SECRET_KEY
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "cad",
                "product_data": {"name": f"Invoice {inv.id} balance due"},
                "unit_amount": round(balance * 100),
            },
            "quantity": 1,
        }],
        success_url=f"{return_url}?payment=success",
        cancel_url=f"{return_url}?payment=cancelled",
        metadata={"invoice_id": inv.id},
    )
    inv.stripe_checkout_session_id = session.id
    db.commit()
    return CheckoutSessionOut(checkout_url=session.url)


# ─── Admin: portal account management ────────────────────────────────────────

@router.get("/accounts", response_model=list[PortalUserOut])
def list_portal_accounts(
    client_id: Optional[int] = Query(None),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ClientPortalUser)
    if client_id is not None:
        q = q.filter(ClientPortalUser.client_id == client_id)
    return q.order_by(ClientPortalUser.id).all()


@router.post("/accounts", response_model=PortalUserOut, status_code=201)
def create_portal_account(
    body: PortalAccountIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.query(Client).filter(Client.id == body.client_id).first():
        raise HTTPException(status_code=404, detail="Client not found")
    if db.query(ClientPortalUser).filter(ClientPortalUser.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    pu = ClientPortalUser(
        client_id=body.client_id,
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        active=True,
        must_change_password=True,
    )
    db.add(pu)
    db.commit()
    db.refresh(pu)
    return pu


@router.patch("/accounts/{account_id}", response_model=PortalUserOut)
def update_portal_account(
    account_id: int,
    body: PortalAccountUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == account_id).first()
    if not pu:
        raise HTTPException(status_code=404, detail="Account not found")

    if body.name is not None:
        pu.name = body.name
    if body.email is not None:
        existing = db.query(ClientPortalUser).filter(
            ClientPortalUser.email == body.email,
            ClientPortalUser.id != account_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        pu.email = body.email
    if body.password is not None:
        pu.password_hash = hash_password(body.password)
        pu.must_change_password = True  # force re-change after admin resets password
    if body.active is not None:
        pu.active = body.active
        if not body.active:
            db.query(PortalRefreshToken).filter(PortalRefreshToken.portal_user_id == pu.id).delete()

    db.commit()
    db.refresh(pu)
    return pu


@router.delete("/accounts/{account_id}", status_code=204)
def delete_portal_account(
    account_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    pu = db.query(ClientPortalUser).filter(ClientPortalUser.id == account_id).first()
    if not pu:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(pu)
    db.commit()
