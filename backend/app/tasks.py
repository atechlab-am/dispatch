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
    from .audit import write_audit

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
            write_audit(db, ticket_id=ticket_id, actor_id=None, actor_label="System (recurring)", action="created")

            r.last_ticket_id = ticket_id
            r.next_run = next_run_after(
                r.interval.value if hasattr(r.interval, "value") else r.interval,
                now,
            )
            db.commit()
            logger.info("Recurring ticket fired: %s → %s", r.name, ticket_id)


async def recurring_invoice_loop():
    """Run every 5 minutes, generate invoices that are due."""
    while True:
        await asyncio.sleep(300)
        try:
            _fire_due_recurring_invoices()
        except Exception:
            logger.exception("Error in recurring invoice loop")


def _fire_due_recurring_invoices():
    from .database import SessionLocal
    from .models.models import RecurringInvoice, Invoice, InvoiceLine
    from .routers.invoices import _make_invoice_id, _compute_totals, _send_invoice_email, InvoiceLineIn
    from .audit import write_audit

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = db.query(RecurringInvoice).filter(
            RecurringInvoice.active == True,
            RecurringInvoice.next_run <= now,
        ).all()

        for r in due:
            invoice_id = _make_invoice_id(db)
            month_label = now.strftime("%B %Y")
            lines = [
                InvoiceLineIn(
                    description=l.description.replace("{month}", month_label),
                    qty=float(l.qty),
                    unit_price=float(l.unit_price),
                )
                for l in r.lines
            ]
            subtotal, tax_amount, total = _compute_totals(lines, float(r.tax_rate))
            invoice = Invoice(
                id=invoice_id,
                client_id=r.client_id,
                client_name=r.client_name,
                client_email=r.client_email,
                client_address=r.client_address,
                tax_rate=r.tax_rate,
                subtotal=subtotal,
                tax_amount=tax_amount,
                total=total,
                notes=r.notes,
                created_by=r.created_by,
            )
            db.add(invoice)
            db.flush()
            for l in lines:
                db.add(InvoiceLine(
                    invoice_id=invoice_id,
                    description=l.description,
                    qty=l.qty,
                    unit_price=l.unit_price,
                    amount=round(l.qty * l.unit_price, 2),
                ))
            write_audit(db, invoice_id=invoice_id, actor_id=None, actor_label="System (recurring)", action="created")

            r.last_invoice_id = invoice_id
            r.next_run = next_run_after(
                r.interval.value if hasattr(r.interval, "value") else r.interval,
                now,
            )
            db.commit()

            if r.auto_send and r.client_email:
                db.refresh(invoice)
                _send_invoice_email(invoice, r.client_email, "", db)
                db.commit()
            logger.info("Recurring invoice fired: %s → %s (auto_send=%s)", r.name, invoice_id, r.auto_send)
