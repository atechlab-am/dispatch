"""Phase 10 — Reporting endpoints.

Five reports, all admin-only:
  GET /reports/revenue          — total billed per month, breakdown by client and service type (date-range filtered)
  GET /reports/technician       — tickets resolved and hours logged per technician (date-range filtered)
  GET /reports/sla              — SLA compliance % per priority over a date range (date-range filtered)
  GET /reports/ar-aging         — 30/60/90 overdue receivables breakdown, as of a point in time
  GET /reports/quote-conversion — Quote -> Ticket -> Invoice funnel counts, conversion rates, and timing (date-range filtered)

All responses include a CSV download URL with the same filters baked in via query params.
The CSV is streamed directly via GET /reports/<type>/csv with identical params.
"""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import (
    HourLog, Invoice, InvoicePayment, InvoiceLine, Ticket,
    TicketStatus, User, Quote, QuoteStatus,
)
from ..security import get_current_user, require_admin

import csv
import io

router = APIRouter(prefix="/reports", tags=["reports"])

CLOSED_STATUSES = {"Resolved", "Closed"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_dt(d: Optional[date]) -> Optional[datetime]:
    if d is None:
        return None
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


# ─── Revenue report ───────────────────────────────────────────────────────────

class RevenueByMonth(BaseModel):
    month: str          # "2026-01"
    total_billed: float
    total_paid: float


class RevenueByClient(BaseModel):
    client_name: str
    total_billed: float
    invoice_count: int


class RevenueReport(BaseModel):
    by_month: list[RevenueByMonth]
    by_client: list[RevenueByClient]
    grand_total_billed: float
    grand_total_paid: float


@router.get("/revenue", response_model=RevenueReport)
def revenue_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    df = _parse_date(date_from)
    dt = _parse_date(date_to)

    invoices = db.query(Invoice).all()
    if df:
        invoices = [i for i in invoices if i.issue_date >= df]
    if dt:
        invoices = [i for i in invoices if i.issue_date <= dt]

    # exclude void
    invoices = [i for i in invoices if i.status != "Void"]

    payments = db.query(InvoicePayment).all()
    paid_by_invoice: dict[str, float] = {}
    for p in payments:
        paid_by_invoice[p.invoice_id] = paid_by_invoice.get(p.invoice_id, 0.0) + float(p.amount)

    by_month: dict[str, dict] = {}
    by_client: dict[str, dict] = {}

    for inv in invoices:
        month_key = inv.issue_date.strftime("%Y-%m")
        total = float(inv.total)
        paid = paid_by_invoice.get(inv.id, 0.0)

        m = by_month.setdefault(month_key, {"month": month_key, "total_billed": 0.0, "total_paid": 0.0})
        m["total_billed"] += total
        m["total_paid"] += paid

        client_key = inv.client_name or "Unknown"
        c = by_client.setdefault(client_key, {"client_name": client_key, "total_billed": 0.0, "invoice_count": 0})
        c["total_billed"] += total
        c["invoice_count"] += 1

    grand_billed = sum(float(i.total) for i in invoices)
    grand_paid = sum(paid_by_invoice.get(i.id, 0.0) for i in invoices)

    return RevenueReport(
        by_month=sorted([RevenueByMonth(**v) for v in by_month.values()], key=lambda r: r.month),
        by_client=sorted([RevenueByClient(**v) for v in by_client.values()], key=lambda r: -r.total_billed),
        grand_total_billed=round(grand_billed, 2),
        grand_total_paid=round(grand_paid, 2),
    )


@router.get("/revenue/csv")
def revenue_csv(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = revenue_report(date_from=date_from, date_to=date_to, db=db, _=_)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Month", "Total Billed", "Total Paid", "Outstanding"])
    for r in data.by_month:
        w.writerow([r.month, f"{r.total_billed:.2f}", f"{r.total_paid:.2f}", f"{r.total_billed - r.total_paid:.2f}"])
    w.writerow([])
    w.writerow(["Client", "Total Billed", "Invoice Count"])
    for r in data.by_client:
        w.writerow([r.client_name, f"{r.total_billed:.2f}", r.invoice_count])
    w.writerow([])
    w.writerow(["Grand Total Billed", f"{data.grand_total_billed:.2f}"])
    w.writerow(["Grand Total Paid", f"{data.grand_total_paid:.2f}"])
    w.writerow(["Outstanding", f"{data.grand_total_billed - data.grand_total_paid:.2f}"])

    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=revenue_report.csv"},
    )


# ─── Technician report ────────────────────────────────────────────────────────

class TechRow(BaseModel):
    technician_name: str
    tickets_resolved: int
    total_hours: float
    total_labour: float


class TechnicianReport(BaseModel):
    rows: list[TechRow]


@router.get("/technician", response_model=TechnicianReport)
def technician_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    df = _parse_date(date_from)
    dt = _parse_date(date_to)

    tickets = db.query(Ticket).filter(Ticket.status.in_(list(CLOSED_STATUSES))).all()
    if df:
        tickets = [t for t in tickets if t.updated_at.date() >= df]
    if dt:
        tickets = [t for t in tickets if t.updated_at.date() <= dt]

    hour_logs = db.query(HourLog).all()
    if df:
        hour_logs = [h for h in hour_logs if h.date >= df]
    if dt:
        hour_logs = [h for h in hour_logs if h.date <= dt]

    users = {u.id: u.name for u in db.query(User).all()}

    tech_map: dict[int, dict] = {}

    for t in tickets:
        uid = t.assigned_to or t.created_by
        row = tech_map.setdefault(uid, {"technician_name": users.get(uid, "Unknown"), "tickets_resolved": 0, "total_hours": 0.0, "total_labour": 0.0})
        row["tickets_resolved"] += 1

    for h in hour_logs:
        ticket = next((t for t in tickets if t.id == h.ticket_id), None)
        if not ticket:
            continue
        uid_for_log = ticket.assigned_to or ticket.created_by
        if uid_for_log:
            row = tech_map.setdefault(uid_for_log, {"technician_name": users.get(uid_for_log, "Unknown"), "tickets_resolved": 0, "total_hours": 0.0, "total_labour": 0.0})
            row["total_hours"] += float(h.hours)
            row["total_labour"] += float(h.hours) * float(h.rate)

    rows = sorted([TechRow(**v) for v in tech_map.values()], key=lambda r: -r.tickets_resolved)
    return TechnicianReport(rows=rows)


@router.get("/technician/csv")
def technician_csv(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = technician_report(date_from=date_from, date_to=date_to, db=db, _=_)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Technician", "Tickets Resolved", "Total Hours", "Total Labour ($)"])
    for r in data.rows:
        w.writerow([r.technician_name, r.tickets_resolved, f"{r.total_hours:.2f}", f"{r.total_labour:.2f}"])

    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=technician_report.csv"},
    )


# ─── SLA compliance report ────────────────────────────────────────────────────

class SLARow(BaseModel):
    priority: str
    total: int
    within_sla: int
    breached: int
    no_sla_set: int
    compliance_pct: float


class SLAReport(BaseModel):
    rows: list[SLARow]
    overall_compliance_pct: float


@router.get("/sla", response_model=SLAReport)
def sla_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    df = _parse_date(date_from)
    dt = _parse_date(date_to)

    tickets = db.query(Ticket).filter(Ticket.status.in_(list(CLOSED_STATUSES))).all()
    if df:
        tickets = [t for t in tickets if t.updated_at.date() >= df]
    if dt:
        tickets = [t for t in tickets if t.updated_at.date() <= dt]

    priority_order = ["Urgent", "High", "Medium", "Low"]
    rows_map: dict[str, dict] = {p: {"priority": p, "total": 0, "within_sla": 0, "breached": 0, "no_sla_set": 0} for p in priority_order}

    for t in tickets:
        p = t.priority
        if p not in rows_map:
            rows_map[p] = {"priority": p, "total": 0, "within_sla": 0, "breached": 0, "no_sla_set": 0}
        rows_map[p]["total"] += 1

        if t.sla_resolution_due is None:
            rows_map[p]["no_sla_set"] += 1
        else:
            due = t.sla_resolution_due.replace(tzinfo=timezone.utc) if t.sla_resolution_due.tzinfo is None else t.sla_resolution_due
            resolved_at = t.updated_at.replace(tzinfo=timezone.utc) if t.updated_at.tzinfo is None else t.updated_at
            if resolved_at <= due:
                rows_map[p]["within_sla"] += 1
            else:
                rows_map[p]["breached"] += 1

    result_rows = []
    for p in priority_order:
        r = rows_map[p]
        measurable = r["within_sla"] + r["breached"]
        pct = (r["within_sla"] / measurable * 100) if measurable > 0 else 0.0
        result_rows.append(SLARow(**r, compliance_pct=round(pct, 1)))

    total_within = sum(r["within_sla"] for r in rows_map.values())
    total_measurable = sum(r["within_sla"] + r["breached"] for r in rows_map.values())
    overall_pct = round(total_within / total_measurable * 100, 1) if total_measurable > 0 else 0.0

    return SLAReport(rows=result_rows, overall_compliance_pct=overall_pct)


@router.get("/sla/csv")
def sla_csv(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = sla_report(date_from=date_from, date_to=date_to, db=db, _=_)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Priority", "Total Resolved", "Within SLA", "Breached", "No SLA Set", "Compliance %"])
    for r in data.rows:
        w.writerow([r.priority, r.total, r.within_sla, r.breached, r.no_sla_set, f"{r.compliance_pct:.1f}%"])
    w.writerow([])
    w.writerow(["Overall Compliance", f"{data.overall_compliance_pct:.1f}%"])

    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sla_report.csv"},
    )


# ─── AR aging report ──────────────────────────────────────────────────────────

AGING_BUCKETS = ["Current", "1-30", "31-60", "61-90", "90+"]


class ARAgingBucket(BaseModel):
    label: str
    count: int
    total: float


class ARAgingInvoice(BaseModel):
    invoice_id: str
    client_name: str
    due_date: Optional[date]
    days_overdue: int
    balance: float
    bucket: str


class ARAgingReport(BaseModel):
    as_of: date
    buckets: list[ARAgingBucket]
    invoices: list[ARAgingInvoice]
    grand_total_outstanding: float


def _aging_bucket(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "Current"
    if days_overdue <= 30:
        return "1-30"
    if days_overdue <= 60:
        return "31-60"
    if days_overdue <= 90:
        return "61-90"
    return "90+"


@router.get("/ar-aging", response_model=ARAgingReport)
def ar_aging_report(
    as_of: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_AR_AGING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    as_of_date = _parse_date(as_of) or datetime.now(timezone.utc).date()

    invoices = db.query(Invoice).filter(Invoice.status.notin_(["Paid", "Void"])).all()
    payments = db.query(InvoicePayment).all()
    paid_by_invoice: dict[str, float] = {}
    for p in payments:
        paid_by_invoice[p.invoice_id] = paid_by_invoice.get(p.invoice_id, 0.0) + float(p.amount)

    bucket_totals = {b: {"label": b, "count": 0, "total": 0.0} for b in AGING_BUCKETS}
    invoice_rows: list[ARAgingInvoice] = []
    grand_total = 0.0

    for inv in invoices:
        balance = round(float(inv.total) - paid_by_invoice.get(inv.id, 0.0), 2)
        if balance <= 0:
            continue
        if inv.due_date:
            days_overdue = (as_of_date - inv.due_date).days
        else:
            days_overdue = 0
        bucket = _aging_bucket(days_overdue)

        bucket_totals[bucket]["count"] += 1
        bucket_totals[bucket]["total"] += balance
        grand_total += balance
        invoice_rows.append(ARAgingInvoice(
            invoice_id=inv.id,
            client_name=inv.client_name,
            due_date=inv.due_date,
            days_overdue=max(days_overdue, 0),
            balance=balance,
            bucket=bucket,
        ))

    return ARAgingReport(
        as_of=as_of_date,
        buckets=[ARAgingBucket(**{**v, "total": round(v["total"], 2)}) for v in bucket_totals.values()],
        invoices=sorted(invoice_rows, key=lambda r: -r.days_overdue),
        grand_total_outstanding=round(grand_total, 2),
    )


@router.get("/ar-aging/csv")
def ar_aging_csv(
    as_of: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = ar_aging_report(as_of=as_of, db=db, _=_)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Bucket", "Count", "Total"])
    for b in data.buckets:
        w.writerow([b.label, b.count, f"{b.total:.2f}"])
    w.writerow([])
    w.writerow(["Invoice", "Client", "Due Date", "Days Overdue", "Balance", "Bucket"])
    for r in data.invoices:
        w.writerow([r.invoice_id, r.client_name, r.due_date.isoformat() if r.due_date else "", r.days_overdue, f"{r.balance:.2f}", r.bucket])
    w.writerow([])
    w.writerow(["Grand Total Outstanding", f"{data.grand_total_outstanding:.2f}"])

    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ar_aging_report.csv"},
    )


# ─── Quote conversion report ──────────────────────────────────────────────────

class QuoteConversionByStatus(BaseModel):
    status: str
    count: int
    total_value: float


class QuoteConversionReport(BaseModel):
    by_status: list[QuoteConversionByStatus]
    approved_count: int
    ticket_created_count: int
    invoice_converted_count: int
    approval_to_ticket_rate: float
    approval_to_invoice_rate: float
    avg_approval_to_ticket_hours: Optional[float]
    avg_ticket_to_invoice_hours: Optional[float]
    approved_value: float
    invoiced_value: float


@router.get("/quote-conversion", response_model=QuoteConversionReport)
def quote_conversion_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_QUOTES:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    df = _parse_date(date_from)
    dt = _parse_date(date_to)

    quotes = db.query(Quote).all()
    if df:
        quotes = [q for q in quotes if q.issue_date >= df]
    if dt:
        quotes = [q for q in quotes if q.issue_date <= dt]

    by_status_map: dict[str, dict] = {}
    for q in quotes:
        row = by_status_map.setdefault(str(q.status), {"status": str(q.status), "count": 0, "total_value": 0.0})
        row["count"] += 1
        row["total_value"] += float(q.total)

    approved = [q for q in quotes if q.status == QuoteStatus.approved]
    ticket_created = [q for q in quotes if q.ticket_id]
    invoice_converted = [q for q in quotes if q.converted_invoice_id]

    approved_count = len(approved)
    ticket_created_count = len(ticket_created)
    invoice_converted_count = len(invoice_converted)

    approval_to_ticket_rate = round(ticket_created_count / approved_count * 100, 1) if approved_count else 0.0
    approval_to_invoice_rate = round(invoice_converted_count / approved_count * 100, 1) if approved_count else 0.0

    tickets_by_id = {t.id: t for t in db.query(Ticket).all()}
    invoices_by_id = {i.id: i for i in db.query(Invoice).all()}

    approval_to_ticket_deltas = []
    for q in ticket_created:
        t = tickets_by_id.get(q.ticket_id)
        if not t:
            continue
        q_updated = q.updated_at.replace(tzinfo=timezone.utc) if q.updated_at.tzinfo is None else q.updated_at
        t_created = t.created_at.replace(tzinfo=timezone.utc) if t.created_at.tzinfo is None else t.created_at
        approval_to_ticket_deltas.append((t_created - q_updated).total_seconds() / 3600.0)

    ticket_to_invoice_deltas = []
    for q in invoice_converted:
        if not q.ticket_id:
            continue
        t = tickets_by_id.get(q.ticket_id)
        inv = invoices_by_id.get(q.converted_invoice_id)
        if not t or not inv:
            continue
        t_created = t.created_at.replace(tzinfo=timezone.utc) if t.created_at.tzinfo is None else t.created_at
        inv_created = inv.created_at.replace(tzinfo=timezone.utc) if inv.created_at.tzinfo is None else inv.created_at
        ticket_to_invoice_deltas.append((inv_created - t_created).total_seconds() / 3600.0)

    avg_approval_to_ticket_hours = round(sum(approval_to_ticket_deltas) / len(approval_to_ticket_deltas), 1) if approval_to_ticket_deltas else None
    avg_ticket_to_invoice_hours = round(sum(ticket_to_invoice_deltas) / len(ticket_to_invoice_deltas), 1) if ticket_to_invoice_deltas else None

    return QuoteConversionReport(
        by_status=sorted([QuoteConversionByStatus(**{**v, "total_value": round(v["total_value"], 2)}) for v in by_status_map.values()], key=lambda r: r.status),
        approved_count=approved_count,
        ticket_created_count=ticket_created_count,
        invoice_converted_count=invoice_converted_count,
        approval_to_ticket_rate=approval_to_ticket_rate,
        approval_to_invoice_rate=approval_to_invoice_rate,
        avg_approval_to_ticket_hours=avg_approval_to_ticket_hours,
        avg_ticket_to_invoice_hours=avg_ticket_to_invoice_hours,
        approved_value=round(sum(float(q.total) for q in approved), 2),
        invoiced_value=round(sum(float(q.total) for q in invoice_converted), 2),
    )


@router.get("/quote-conversion/csv")
def quote_conversion_csv(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    data = quote_conversion_report(date_from=date_from, date_to=date_to, db=db, _=_)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Status", "Count", "Total Value"])
    for r in data.by_status:
        w.writerow([r.status, r.count, f"{r.total_value:.2f}"])
    w.writerow([])
    w.writerow(["Quotes Approved", data.approved_count])
    w.writerow(["Tickets Created", data.ticket_created_count])
    w.writerow(["Invoices Converted", data.invoice_converted_count])
    w.writerow(["Approval -> Ticket Rate", f"{data.approval_to_ticket_rate:.1f}%"])
    w.writerow(["Approval -> Invoice Rate", f"{data.approval_to_invoice_rate:.1f}%"])
    w.writerow(["Avg Approval -> Ticket (hours)", data.avg_approval_to_ticket_hours if data.avg_approval_to_ticket_hours is not None else ""])
    w.writerow(["Avg Ticket -> Invoice (hours)", data.avg_ticket_to_invoice_hours if data.avg_ticket_to_invoice_hours is not None else ""])
    w.writerow(["Approved Value", f"{data.approved_value:.2f}"])
    w.writerow(["Invoiced Value", f"{data.invoiced_value:.2f}"])

    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=quote_conversion_report.csv"},
    )
