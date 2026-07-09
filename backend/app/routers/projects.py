from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Project, Quote, QuoteStatus, Ticket, Invoice, User
from ..security import get_current_user
from .. import config

router = APIRouter(prefix="/projects", tags=["projects"])


def _require_enabled():
    if not config.FEATURE_QUOTES:
        raise HTTPException(status_code=503, detail="This feature is disabled")


def _make_project_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"PRJ-{year}-"
    last = (
        db.query(Project)
        .filter(Project.id.like(f"{prefix}%"))
        .order_by(Project.id.desc())
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.id.replace(prefix, "")) + 1
        except ValueError:
            pass
    return f"{prefix}{n:05d}"


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


class ProjectIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ProjectCreateOut(BaseModel):
    id: str
    name: str
    quote_id: str


class ProjectListItem(BaseModel):
    id: str
    name: str
    created_at: datetime
    quote_id: Optional[str] = None
    quote_status: Optional[str] = None
    ticket_id: Optional[str] = None
    ticket_status: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_status: Optional[str] = None
    stage: str  # "Quote" | "Ticket" | "Invoice"


class ProjectsPage(BaseModel):
    items: list[ProjectListItem]
    total: int
    page: int
    page_size: int


def _build_list_item(p: Project, q: Optional[Quote], t: Optional[Ticket], inv: Optional[Invoice]) -> ProjectListItem:
    stage = "Quote"
    if inv is not None:
        stage = "Invoice"
    elif t is not None:
        stage = "Ticket"
    return ProjectListItem(
        id=p.id,
        name=p.name,
        created_at=p.created_at,
        quote_id=q.id if q else None,
        quote_status=q.status if q else None,
        ticket_id=t.id if t else None,
        ticket_status=t.status.value if t and hasattr(t.status, "value") else (t.status if t else None),
        invoice_id=inv.id if inv else None,
        invoice_status=inv.status.value if inv and hasattr(inv.status, "value") else (inv.status if inv else None),
        stage=stage,
    )


@router.get("", response_model=ProjectsPage)
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_enabled()
    q = db.query(Project)
    total = q.count()
    projects = q.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for p in projects:
        quote = p.quote
        ticket = db.query(Ticket).filter(Ticket.id == quote.ticket_id).first() if quote and quote.ticket_id else None
        invoice = db.query(Invoice).filter(Invoice.id == quote.converted_invoice_id).first() if quote and quote.converted_invoice_id else None
        items.append(_build_list_item(p, quote, ticket, invoice))

    return ProjectsPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{project_id}", response_model=ProjectListItem)
def get_project(project_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_enabled()
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    quote = p.quote
    ticket = db.query(Ticket).filter(Ticket.id == quote.ticket_id).first() if quote and quote.ticket_id else None
    invoice = db.query(Invoice).filter(Invoice.id == quote.converted_invoice_id).first() if quote and quote.converted_invoice_id else None
    return _build_list_item(p, quote, ticket, invoice)


@router.post("", response_model=ProjectCreateOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    now = datetime.now(timezone.utc)

    project = Project(
        id=_make_project_id(db),
        name=body.name,
        created_at=now,
        created_by=current_user.id,
    )
    db.add(project)
    db.flush()

    quote = Quote(
        id=_make_quote_id(db),
        project_id=project.id,
        project_name=body.name,
        status=QuoteStatus.draft,
        issue_date=date.today(),
        subtotal=0,
        tax_rate=0,
        tax_amount=0,
        total=0,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(quote)
    db.commit()
    db.refresh(project)
    db.refresh(quote)

    return ProjectCreateOut(id=project.id, name=project.name, quote_id=quote.id)
