from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Ticket, Client, Invoice, Quote, User
from ..security import get_current_user
from .. import config

router = APIRouter(prefix="/search", tags=["search"])

_MAX_PER_ENTITY = 10


def _require_enabled():
    if not config.FEATURE_GLOBAL_SEARCH:
        raise HTTPException(status_code=503, detail="This feature is disabled")


@router.get("")
def global_search(
    q: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search across tickets, clients, invoices, and quotes in one call.
    Each entity is capped at _MAX_PER_ENTITY results — this powers a topbar
    quick-search dropdown, not a full search-results page."""
    _require_enabled()
    term = f"%{q}%"

    tickets = (
        db.query(Ticket)
        .filter(or_(Ticket.client_name.ilike(term), Ticket.title.ilike(term), Ticket.id.ilike(term)))
        .order_by(Ticket.created_at.desc())
        .limit(_MAX_PER_ENTITY)
        .all()
    )
    clients = (
        db.query(Client)
        .filter(or_(Client.name.ilike(term), Client.company.ilike(term), Client.email.ilike(term)))
        .order_by(Client.name)
        .limit(_MAX_PER_ENTITY)
        .all()
    )
    invoices = (
        db.query(Invoice)
        .filter(or_(Invoice.client_name.ilike(term), Invoice.id.ilike(term)))
        .order_by(Invoice.created_at.desc())
        .limit(_MAX_PER_ENTITY)
        .all()
    )
    quotes = []
    if config.FEATURE_QUOTES:
        quotes = (
            db.query(Quote)
            .filter(or_(Quote.client_name.ilike(term), Quote.id.ilike(term)))
            .order_by(Quote.created_at.desc())
            .limit(_MAX_PER_ENTITY)
            .all()
        )

    return {
        "tickets": [{"id": t.id, "title": t.title, "status": str(t.status), "client_name": t.client_name} for t in tickets],
        "clients": [{"id": c.id, "name": c.name, "company": c.company, "email": c.email} for c in clients],
        "invoices": [{"id": i.id, "client_name": i.client_name, "status": str(i.status), "total": float(i.total)} for i in invoices],
        "quotes": [{"id": q_.id, "client_name": q_.client_name, "status": str(q_.status), "total": float(q_.total)} for q_ in quotes],
    }
