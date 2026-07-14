import csv
import io
from datetime import datetime, date, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from .. import config
from ..database import get_db
from ..models.models import User, Ticket, ServiceLine, HourLog, TicketMaterial, TicketStatus, ACTIVE_TICKET_STATUSES
from ..schemas import TicketIn, TicketOut, TicketsPage, TicketListItem
from ..security import get_current_user, require_admin
from .. import email as mailer
from ..audit import write_audit, actor_of
from ..notifications import create_notification

router = APIRouter(prefix="/tickets", tags=["tickets"])

# Response hours, Resolution hours
SLA_HOURS = {
    "Urgent": (1,   4),
    "High":   (4,   8),
    "Medium": (8,  24),
    "Low":    (24, 72),
}

# Per-client SLA tier multipliers applied to SLA_HOURS above. Gold is tighter
# (faster deadlines), bronze is looser — silver is a passthrough alias for the
# global table so "no tier" and "silver tier" behave identically. Only takes
# effect when FEATURE_SLA_TIERS is enabled; ignored (falls back to the global
# table) otherwise.
SLA_TIER_MULTIPLIERS = {
    "gold":   0.5,
    "silver": 1.0,
    "bronze": 1.5,
}


def _add_business_hours(dt: datetime, hours: int) -> datetime:
    """Advance dt by `hours` of business time, skipping Sat/Sun."""
    remaining = timedelta(hours=hours)
    current = dt
    while remaining > timedelta(0):
        # If we're already on a weekend, jump to next Monday 00:00
        if current.weekday() >= 5:
            days_ahead = 7 - current.weekday()
            current = (current + timedelta(days=days_ahead)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            continue
        # How much of today is left before the weekend?
        # Find start of next Saturday
        days_to_weekend = 5 - current.weekday()  # days until Saturday
        end_of_week = (current + timedelta(days=days_to_weekend)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        available = end_of_week - current
        if remaining <= available:
            current = current + remaining
            remaining = timedelta(0)
        else:
            remaining -= available
            current = end_of_week
    return current


def _sla_deadlines(priority: str, from_dt: datetime, tier: Optional[str] = None):
    response_h, resolution_h = SLA_HOURS.get(priority, (8, 24))
    if tier and config.FEATURE_SLA_TIERS:
        mult = SLA_TIER_MULTIPLIERS.get(tier, 1.0)
        response_h *= mult
        resolution_h *= mult
    if priority == "Urgent":
        return (
            from_dt + timedelta(hours=response_h),
            from_dt + timedelta(hours=resolution_h),
        )
    return (
        _add_business_hours(from_dt, response_h),
        _add_business_hours(from_dt, resolution_h),
    )


def _client_sla_tier(db: Session, client_id: Optional[int]) -> Optional[str]:
    if not client_id or not config.FEATURE_SLA_TIERS:
        return None
    from ..models.models import Client
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c or not c.sla_tier:
        return None
    return c.sla_tier.value if hasattr(c.sla_tier, "value") else c.sla_tier


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


def _apply_materials_used(ticket: Ticket, items: list, db: Session):
    for m in items:
        db.add(TicketMaterial(
            ticket_id=ticket.id,
            material_id=m.material_id,
            name=m.name,
            unit_price=m.unit_price,
            qty=m.qty,
        ))


def _ticket_total(ticket: Ticket) -> float:
    TRAVEL = {"travel_none": 0, "travel_15": 40, "travel_30": 60, "travel_30p": 80}
    svc = sum(
        (sl.base + (sl.per_unit * sl.extra_qty) if sl.type == "flat" else
         sl.rate * sl.qty if sl.type == "per_unit" else 0)
        for sl in ticket.service_lines
    )
    hrs = sum((hl.hours * hl.rate) for hl in ticket.hour_logs)
    mat = sum((tm.unit_price * tm.qty) for tm in ticket.materials_used)
    travel = TRAVEL.get(ticket.travel_fee.value if hasattr(ticket.travel_fee, "value") else ticket.travel_fee, 0)
    return round(svc + hrs + mat + travel, 2)


@router.get("/export")
def export_tickets(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    fmt: str = Query("csv"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(Ticket)
    if status_filter and status_filter != "All":
        if status_filter == "Active":
            q = q.filter(Ticket.status.in_(ACTIVE_TICKET_STATUSES))
        else:
            q = q.filter(Ticket.status == status_filter)
    if priority and priority != "All":
        q = q.filter(Ticket.priority == priority)
    if client_name:
        q = q.filter(Ticket.client_name.ilike(f"%{client_name}%"))
    if date_from:
        q = q.filter(Ticket.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        # Include the whole of date_to by using the start of the next day as an
        # exclusive upper bound. Add via timedelta so month/year roll over correctly
        # (date_to.day + 1 would crash on the last day of a month).
        next_day = date_to + timedelta(days=1)
        q = q.filter(Ticket.created_at < datetime(next_day.year, next_day.month, next_day.day, tzinfo=timezone.utc))

    tickets = q.order_by(Ticket.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Ticket ID", "Type", "Status", "Priority", "Client Type",
        "Client Name", "Client Email", "Client Phone",
        "Title", "Travel Fee", "Services Total", "Labour Total", "Materials Total", "Grand Total",
        "SLA Response Due", "SLA Resolution Due",
        "Created At", "Updated At",
    ])
    for t in tickets:
        svc = sum(
            (sl.base + (sl.per_unit * sl.extra_qty) if sl.type == "flat" else
             sl.rate * sl.qty if sl.type == "per_unit" else 0)
            for sl in t.service_lines
        )
        hrs = sum(hl.hours * hl.rate for hl in t.hour_logs)
        mat = sum(tm.unit_price * tm.qty for tm in t.materials_used)
        travel_fee_key = t.travel_fee.value if hasattr(t.travel_fee, "value") else t.travel_fee
        travel = {"travel_none": 0, "travel_15": 40, "travel_30": 60, "travel_30p": 80}.get(travel_fee_key, 0)
        writer.writerow([
            t.id,
            t.ticket_type.value if hasattr(t.ticket_type, "value") else t.ticket_type,
            t.status.value if hasattr(t.status, "value") else t.status,
            t.priority.value if hasattr(t.priority, "value") else t.priority,
            t.client_type.value if hasattr(t.client_type, "value") else t.client_type,
            t.client_name,
            t.client_email,
            t.client_phone,
            t.title,
            travel,
            round(svc, 2),
            round(hrs, 2),
            round(mat, 2),
            round(svc + hrs + mat + travel, 2),
            t.sla_response_due.isoformat() if t.sla_response_due else "",
            t.sla_resolution_due.isoformat() if t.sla_resolution_due else "",
            t.created_at.isoformat() if t.created_at else "",
            t.updated_at.isoformat() if t.updated_at else "",
        ])

    output.seek(0)
    filename = f"tickets_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("", response_model=TicketsPage)
def list_tickets(
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[int] = Query(None),
    has_appointment: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Ticket)

    if status_filter and status_filter != "All":
        if status_filter == "Active":
            q = q.filter(Ticket.status.in_(ACTIVE_TICKET_STATUSES))
        else:
            q = q.filter(Ticket.status == status_filter)

    if assigned_to:
        q = q.filter(Ticket.assigned_to == assigned_to)

    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            Ticket.client_name.ilike(term),
            Ticket.title.ilike(term),
            Ticket.id.ilike(term),
        ))

    # Ignored (not a hard error) when scheduling is disabled, since ticket listing
    # itself must keep working regardless of this unrelated optional param.
    if has_appointment is not None and config.FEATURE_SCHEDULING:
        from ..models.models import Appointment
        appt_ticket_ids = db.query(Appointment.ticket_id).filter(Appointment.ticket_id.isnot(None)).distinct()
        if has_appointment:
            q = q.filter(Ticket.id.in_(appt_ticket_ids))
        else:
            # "Needs scheduling" too — a ticket flagged as not needing a visit
            # (e.g. remote work with no call required) shouldn't linger in the
            # Schedule tab's Unscheduled Tickets sidebar forever.
            q = q.filter(Ticket.id.notin_(appt_ticket_ids), Ticket.needs_scheduling.is_(True))

    total = q.count()
    items = (
        q.options(
            selectinload(Ticket.service_lines),
            selectinload(Ticket.hour_logs),
            selectinload(Ticket.materials_used),
        )
        .order_by(Ticket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # TicketListItem doesn't carry the raw service_lines/hour_logs/materials_used
    # arrays (too heavy for a paginated list), so the dollar total the ticket
    # list/board view displays has to be precomputed here instead — otherwise
    # the frontend's own total-from-arrays math silently sees empty arrays and
    # renders $0 regardless of what's actually logged on the ticket.
    out_items = []
    for t in items:
        item = TicketListItem.model_validate(t)
        item.grand_total = _ticket_total(t)
        out_items.append(item)

    return TicketsPage(items=out_items, total=total, page=page, page_size=page_size)


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    body: TicketIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket_id = _make_ticket_id(db)
    now = datetime.now(timezone.utc)
    tier = _client_sla_tier(db, body.client_id)
    sla_response, sla_resolution = _sla_deadlines(body.priority.value, now, tier)
    ticket = Ticket(
        id=ticket_id,
        client_id=body.client_id,
        assigned_to=body.assigned_to,
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
        work_location=body.work_location,
        needs_scheduling=body.needs_scheduling,
        created_by=current_user.id,
        sla_response_due=sla_response,
        sla_resolution_due=sla_resolution,
    )
    db.add(ticket)
    db.flush()

    _apply_service_lines(ticket, body.service_lines, db)
    _apply_hour_logs(ticket, body.hour_logs, db)
    _apply_materials_used(ticket, body.materials_used, db)

    actor_id, actor_label = actor_of(current_user)
    write_audit(db, ticket_id=ticket.id, actor_id=actor_id, actor_label=actor_label, action="created")
    if body.assigned_to:
        create_notification(
            db, user_id=body.assigned_to, ticket_id=ticket.id, kind="assigned",
            message=f"You were assigned ticket {ticket.id}: {body.title}",
        )

    db.commit()
    db.refresh(ticket)

    assignee_email = ""
    if body.assigned_to:
        assignee = db.query(User).filter(User.id == body.assigned_to).first()
        assignee_email = assignee.email if assignee else ""
    mailer.notify_ticket_created(
        ticket_id=ticket_id,
        title=body.title,
        priority=body.priority.value,
        client_email=body.client_email,
        client_name=body.client_name,
        assignee_email=assignee_email,
    )

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
    current_user: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    prev_status = ticket.status.value if hasattr(ticket.status, "value") else ticket.status
    new_status = body.status.value if hasattr(body.status, "value") else body.status
    priority_changed = ticket.priority != body.priority
    now = datetime.now(timezone.utc)

    # Snapshot auditable fields before they're overwritten below.
    audit_old = {
        "status": prev_status,
        "priority": ticket.priority.value if hasattr(ticket.priority, "value") else ticket.priority,
        "assigned_to": ticket.assigned_to,
        "client_id": ticket.client_id,
        "title": ticket.title,
        "description": ticket.description,
        "internal_notes": ticket.internal_notes,
        "travel_fee": ticket.travel_fee.value if hasattr(ticket.travel_fee, "value") else ticket.travel_fee,
    }
    audit_old_total = _ticket_total(ticket)

    # SLA pause/resume on Awaiting Client or On Hold
    paused_statuses = {"Awaiting Client", "On Hold"}
    if prev_status not in paused_statuses and new_status in paused_statuses:
        # Pause: record when we started waiting
        ticket.sla_paused_at = now
    elif prev_status in paused_statuses and new_status not in paused_statuses | {"Resolved", "Closed"}:
        # Resume: extend both deadlines by the time spent waiting
        if ticket.sla_paused_at:
            paused_at = ticket.sla_paused_at.replace(tzinfo=timezone.utc) if ticket.sla_paused_at.tzinfo is None else ticket.sla_paused_at
            elapsed = now - paused_at
            if ticket.sla_response_due:
                rd = ticket.sla_response_due.replace(tzinfo=timezone.utc) if ticket.sla_response_due.tzinfo is None else ticket.sla_response_due
                ticket.sla_response_due = rd + elapsed
            if ticket.sla_resolution_due:
                rsd = ticket.sla_resolution_due.replace(tzinfo=timezone.utc) if ticket.sla_resolution_due.tzinfo is None else ticket.sla_resolution_due
                ticket.sla_resolution_due = rsd + elapsed
            ticket.sla_paused_at = None
        # Deadlines just moved out, so a previous breach notification no longer
        # reflects reality — let the escalation loop re-notify if it re-breaches.
        ticket.sla_breach_notified_at = None
    elif prev_status in {"Resolved", "Closed"} and new_status not in {"Resolved", "Closed"}:
        # Reopened from a terminal state — same reasoning, clear the guard.
        ticket.sla_breach_notified_at = None

    ticket.client_id = body.client_id
    ticket.assigned_to = body.assigned_to
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
    ticket.work_location = body.work_location
    ticket.needs_scheduling = body.needs_scheduling
    ticket.updated_at = now
    client_changed = audit_old["client_id"] != body.client_id
    if priority_changed or client_changed or ticket.sla_response_due is None:
        base = ticket.created_at.replace(tzinfo=timezone.utc) if ticket.created_at.tzinfo is None else ticket.created_at
        tier = _client_sla_tier(db, body.client_id)
        ticket.sla_response_due, ticket.sla_resolution_due = _sla_deadlines(body.priority.value, base, tier)
        ticket.sla_paused_at = None
        ticket.sla_breach_notified_at = None

    # Replace child rows. Hour logs are only deleted/recreated for manual entries
    # (started_at is null) — timer-originated rows are owned by the timer endpoints
    # and must survive a ticket save, otherwise a running/completed timer would be
    # silently wiped out by the next autosave.
    db.query(ServiceLine).filter(ServiceLine.ticket_id == ticket_id).delete()
    db.query(HourLog).filter(
        HourLog.ticket_id == ticket_id,
        HourLog.started_at.is_(None),
    ).delete()
    db.query(TicketMaterial).filter(TicketMaterial.ticket_id == ticket_id).delete()
    db.flush()

    _apply_service_lines(ticket, body.service_lines, db)
    _apply_hour_logs(ticket, body.hour_logs, db)
    _apply_materials_used(ticket, body.materials_used, db)
    db.flush()
    db.expire(ticket, ["service_lines", "hour_logs", "materials_used"])

    actor_id, actor_label = actor_of(current_user)
    audit_new = {
        "status": ticket.status.value if hasattr(ticket.status, "value") else ticket.status,
        "priority": ticket.priority.value if hasattr(ticket.priority, "value") else ticket.priority,
        "assigned_to": ticket.assigned_to,
        "client_id": ticket.client_id,
        "title": ticket.title,
        "description": ticket.description,
        "internal_notes": ticket.internal_notes,
        "travel_fee": ticket.travel_fee.value if hasattr(ticket.travel_fee, "value") else ticket.travel_fee,
    }
    dedicated_actions = {"status": "status_changed", "assigned_to": "assignee_changed"}
    for field_name, old_value in audit_old.items():
        new_value = audit_new[field_name]
        if old_value != new_value:
            write_audit(
                db, ticket_id=ticket.id, actor_id=actor_id, actor_label=actor_label,
                action=dedicated_actions.get(field_name, "field_changed"),
                field=field_name, old_value=str(old_value), new_value=str(new_value),
            )
    audit_new_total = _ticket_total(ticket)
    if audit_new_total != audit_old_total:
        write_audit(
            db, ticket_id=ticket.id, actor_id=actor_id, actor_label=actor_label,
            action="price_changed", field="price",
            old_value=str(audit_old_total), new_value=str(audit_new_total),
        )

    # In-app notifications — independent of the email path above, which only fires
    # on status change. Reassignment notifies regardless of whether status also
    # changed, closing a gap the email flow has always had.
    if audit_old["assigned_to"] != ticket.assigned_to and ticket.assigned_to:
        create_notification(
            db, user_id=ticket.assigned_to, ticket_id=ticket.id, kind="reassigned",
            message=f"Ticket {ticket.id} was reassigned to you: {ticket.title}",
        )
    if audit_old["status"] != audit_new["status"] and ticket.assigned_to:
        create_notification(
            db, user_id=ticket.assigned_to, ticket_id=ticket.id, kind="status_changed",
            message=f"Ticket {ticket.id} status changed to {audit_new['status']}: {ticket.title}",
        )

    db.commit()
    db.refresh(ticket)

    assignee_email = ""
    if body.assigned_to:
        assignee = db.query(User).filter(User.id == body.assigned_to).first()
        assignee_email = assignee.email if assignee else ""
    new_status = body.status.value if hasattr(body.status, "value") else body.status
    mailer.notify_ticket_updated(
        ticket_id=ticket_id,
        title=body.title,
        status=new_status,
        priority=body.priority.value if hasattr(body.priority, "value") else body.priority,
        client_email=body.client_email,
        assignee_email=assignee_email,
        prev_status=prev_status,
    )

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
