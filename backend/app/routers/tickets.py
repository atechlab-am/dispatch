from datetime import datetime, date, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, Ticket, ServiceLine, HourLog, TicketStatus
from ..schemas import TicketIn, TicketOut, TicketsPage, TicketListItem
from ..security import get_current_user

router = APIRouter(prefix="/tickets", tags=["tickets"])

# Response hours, Resolution hours
SLA_HOURS = {
    "Urgent": (1,   4),
    "High":   (4,   8),
    "Medium": (8,  24),
    "Low":    (24, 72),
}


def _sla_deadlines(priority: str, from_dt: datetime):
    response_h, resolution_h = SLA_HOURS.get(priority, (8, 24))
    return (
        from_dt + timedelta(hours=response_h),
        from_dt + timedelta(hours=resolution_h),
    )


TRAVEL_FEES = {
    "travel_none": 0,
    "travel_15": 40,
    "travel_30": 60,
    "travel_30p": 80,
}


def _make_ticket_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"TKT-{year}-"
    last = (
        db.query(Ticket)
        .filter(Ticket.id.like(f"{prefix}%"))
        .order_by(Ticket.id.desc())
        .first()
    )
    if last:
        try:
            n = int(last.id.replace(prefix, "")) + 1
        except ValueError:
            n = 1
    else:
        n = 1
    return f"{prefix}{n:05d}"


def _apply_service_lines(ticket: Ticket, lines: list, db: Session):
    for sl in lines:
        db.add(ServiceLine(
            ticket_id=ticket.id,
            service_id=sl.service_id,
            name=sl.name,
            type=sl.type,
            rate=sl.rate,
            base=sl.base,
            per_unit=sl.per_unit,
            per_unit_label=sl.per_unit_label,
            unit_label=sl.unit_label,
            qty=sl.qty,
            extra_qty=sl.extra_qty,
        ))


def _apply_hour_logs(ticket: Ticket, logs: list, db: Session):
    for hl in logs:
        db.add(HourLog(
            ticket_id=ticket.id,
            date=hl.date,
            hours=hl.hours,
            rate=hl.rate,
            description=hl.description,
        ))


@router.get("", response_model=TicketsPage)
def list_tickets(
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Ticket)

    if status_filter and status_filter != "All":
        q = q.filter(Ticket.status == status_filter)

    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            Ticket.client_name.ilike(term),
            Ticket.title.ilike(term),
            Ticket.id.ilike(term),
        ))

    total = q.count()
    items = (
        q.order_by(Ticket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return TicketsPage(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    body: TicketIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket_id = _make_ticket_id(db)
    now = datetime.now(timezone.utc)
    sla_response, sla_resolution = _sla_deadlines(body.priority.value, now)
    ticket = Ticket(
        id=ticket_id,
        client_id=body.client_id,
        ticket_type=body.ticket_type,
        status=body.status,
        priority=body.priority,
        client_type=body.client_type,
        client_name=body.client_name,
        client_email=body.client_email,
        client_phone=body.client_phone,
        client_address=body.client_address,
        title=body.title,
        description=body.description,
        internal_notes=body.internal_notes,
        travel_fee=body.travel_fee,
        created_by=current_user.id,
        sla_response_due=sla_response,
        sla_resolution_due=sla_resolution,
    )
    db.add(ticket)
    db.flush()

    _apply_service_lines(ticket, body.service_lines, db)
    _apply_hour_logs(ticket, body.hour_logs, db)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.put("/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: str,
    body: TicketIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    priority_changed = ticket.priority != body.priority
    ticket.client_id = body.client_id
    ticket.ticket_type = body.ticket_type
    ticket.status = body.status
    ticket.priority = body.priority
    ticket.client_type = body.client_type
    ticket.client_name = body.client_name
    ticket.client_email = body.client_email
    ticket.client_phone = body.client_phone
    ticket.client_address = body.client_address
    ticket.title = body.title
    ticket.description = body.description
    ticket.internal_notes = body.internal_notes
    ticket.travel_fee = body.travel_fee
    ticket.updated_at = datetime.now(timezone.utc)
    if priority_changed or ticket.sla_response_due is None:
        base = ticket.created_at.replace(tzinfo=timezone.utc) if ticket.created_at.tzinfo is None else ticket.created_at
        ticket.sla_response_due, ticket.sla_resolution_due = _sla_deadlines(body.priority.value, base)

    # Replace child rows
    db.query(ServiceLine).filter(ServiceLine.ticket_id == ticket_id).delete()
    db.query(HourLog).filter(HourLog.ticket_id == ticket_id).delete()
    db.flush()

    _apply_service_lines(ticket, body.service_lines, db)
    _apply_hour_logs(ticket, body.hour_logs, db)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(ticket)
    db.commit()
