"""Background task: fire recurring tickets when next_run is due."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


def next_run_after(interval: str, from_dt: datetime) -> datetime:
    """Return the next scheduled run datetime after from_dt."""
    if interval == "daily":
        return from_dt + timedelta(days=1)
    if interval == "weekly":
        return from_dt + timedelta(weeks=1)
    if interval == "monthly":
        # Same day next month, clamped to month end
        m = from_dt.month + 1
        y = from_dt.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        import calendar
        last_day = calendar.monthrange(y, m)[1]
        return from_dt.replace(year=y, month=m, day=min(from_dt.day, last_day))
    if interval == "quarterly":
        m = from_dt.month + 3
        y = from_dt.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        import calendar
        last_day = calendar.monthrange(y, m)[1]
        return from_dt.replace(year=y, month=m, day=min(from_dt.day, last_day))
    raise ValueError(f"Unknown interval: {interval}")


async def recurring_ticket_loop():
    """Run every 5 minutes, create tickets that are due."""
    while True:
        await asyncio.sleep(300)
        try:
            _fire_due_recurring()
        except Exception:
            logger.exception("Error in recurring ticket loop")


def _fire_due_recurring():
    from .database import SessionLocal
    from .models.models import RecurringTicket, Ticket
    from .routers.tickets import _make_ticket_id, _sla_deadlines

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = db.query(RecurringTicket).filter(
            RecurringTicket.active == True,
            RecurringTicket.next_run <= now,
        ).all()

        for r in due:
            ticket_id = _make_ticket_id(db)
            sla_r, sla_res = _sla_deadlines(r.priority.value if hasattr(r.priority, "value") else r.priority, now)
            ticket = Ticket(
                id=ticket_id,
                client_id=r.client_id,
                assigned_to=r.assigned_to,
                ticket_type=r.ticket_type,
                status="Open",
                priority=r.priority,
                client_type=r.client_type,
                client_name=r.client_name,
                client_email=r.client_email,
                client_phone=r.client_phone,
                client_address=r.client_address,
                title=r.title,
                description=r.description,
                internal_notes=r.internal_notes,
                travel_fee=r.travel_fee,
                created_by=r.created_by,
                sla_response_due=sla_r,
                sla_resolution_due=sla_res,
            )
            db.add(ticket)
            db.flush()

            r.last_ticket_id = ticket_id
            r.next_run = next_run_after(
                r.interval.value if hasattr(r.interval, "value") else r.interval,
                now,
            )
            db.commit()
            logger.info("Recurring ticket fired: %s → %s", r.name, ticket_id)
