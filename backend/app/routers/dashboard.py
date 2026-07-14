from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.models import Ticket, TicketStatus, User, Quote, QuoteStatus, ACTIVE_TICKET_STATUSES, Lead, LeadStage
from ..schemas import TicketListItem
from ..routers.leads import LeadOut
from ..security import get_current_user
from .. import config

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ACTIVE_STATUSES = ACTIVE_TICKET_STATUSES


class StatCard(BaseModel):
    label: str
    value: int
    color: str = "blue"


class FunnelStage(BaseModel):
    label: str
    count: int


class PipelineStage(BaseModel):
    label: str
    stage: str
    count: int


class DashboardOut(BaseModel):
    stats: list[StatCard]
    funnel: list[FunnelStage]  # Quote -> Ticket -> Invoice workflow stage counts
    my_active: list[TicketListItem]
    sla_urgent: list[TicketListItem]  # breached or < 2h left on resolution
    recent_open: list[TicketListItem]  # newest open tickets not assigned to me
    lead_stats: list[StatCard] = []
    lead_pipeline: list[PipelineStage] = []  # count per LeadStage, in pipeline order
    leads_follow_up: list[LeadOut] = []  # follow_up_scheduled leads, overdue first then soonest-due


@router.get("", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    sla_warn_threshold = now + timedelta(hours=2)

    all_tickets = db.query(Ticket).all()

    active = [t for t in all_tickets if t.status in ACTIVE_STATUSES]
    closed = [t for t in all_tickets if t.status in {"Resolved", "Closed"}]
    urgent = [t for t in active if t.priority == "Urgent"]
    breached = [
        t for t in active
        if t.sla_resolution_due and t.sla_resolution_due.replace(tzinfo=timezone.utc) < now
    ]
    sla_warning = [
        t for t in active
        if t.sla_resolution_due
        and now <= t.sla_resolution_due.replace(tzinfo=timezone.utc) <= sla_warn_threshold
    ]

    stats = [
        StatCard(label="Total Tickets", value=len(all_tickets), color="blue"),
        StatCard(label="Active", value=len(active), color="blue"),
        StatCard(label="Resolved / Closed", value=len(closed), color="green"),
        StatCard(label="Urgent", value=len(urgent), color="red"),
        StatCard(label="SLA Breached", value=len(breached), color="red"),
        StatCard(label="SLA Warning (< 2h)", value=len(sla_warning), color="amber"),
    ]

    my_active = sorted(
        [t for t in active if t.created_by == current_user.id],
        key=lambda t: (
            {"Urgent": 0, "High": 1, "Medium": 2, "Low": 3}.get(t.priority, 9),
            t.created_at,
        ),
    )

    sla_urgent_set = {t.id for t in breached} | {t.id for t in sla_warning}
    sla_urgent_tickets = sorted(
        [t for t in active if t.id in sla_urgent_set],
        key=lambda t: t.sla_resolution_due or now,
    )

    recent_open = sorted(
        [t for t in active if t.created_by != current_user.id],
        key=lambda t: t.created_at,
        reverse=True,
    )[:10]

    funnel: list[FunnelStage] = []
    if config.FEATURE_QUOTES:
        funnel = [
            FunnelStage(label="Quotes Approved", count=db.query(Quote).filter(Quote.status == QuoteStatus.approved).count()),
            FunnelStage(label="Tickets Created", count=db.query(Quote).filter(Quote.ticket_id.isnot(None)).count()),
            FunnelStage(label="Invoices Converted", count=db.query(Quote).filter(Quote.converted_invoice_id.isnot(None)).count()),
        ]

    lead_stats: list[StatCard] = []
    lead_pipeline: list[PipelineStage] = []
    leads_follow_up: list[Lead] = []
    if config.FEATURE_LEADS:
        all_leads = db.query(Lead).all()
        active_leads = [l for l in all_leads if l.stage not in (LeadStage.won, LeadStage.lost)]
        won_leads = [l for l in all_leads if l.stage == LeadStage.won]
        lost_leads = [l for l in all_leads if l.stage == LeadStage.lost]

        lead_stats = [
            StatCard(label="Total Leads", value=len(all_leads), color="blue"),
            StatCard(label="Active Leads", value=len(active_leads), color="blue"),
            StatCard(label="Won", value=len(won_leads), color="green"),
            StatCard(label="Lost", value=len(lost_leads), color="red"),
        ]

        pipeline_order = [LeadStage.new, LeadStage.contacted, LeadStage.qualified, LeadStage.proposal, LeadStage.won, LeadStage.lost]
        pipeline_labels = {
            LeadStage.new: "New", LeadStage.contacted: "Contacted", LeadStage.qualified: "Qualified",
            LeadStage.proposal: "Proposal", LeadStage.won: "Won", LeadStage.lost: "Lost",
        }
        counts = {s: 0 for s in pipeline_order}
        for l in all_leads:
            if l.stage in counts:
                counts[l.stage] += 1
        lead_pipeline = [PipelineStage(label=pipeline_labels[s], stage=s.value, count=counts[s]) for s in pipeline_order]

        # Overdue follow-ups first (oldest due date first), then upcoming ones soonest-first.
        due_leads = [l for l in all_leads if l.follow_up_scheduled and l.follow_up_date]
        today = now.date()
        leads_follow_up = sorted(due_leads, key=lambda l: (l.follow_up_date >= today, l.follow_up_date))[:10]

    return DashboardOut(
        stats=stats,
        funnel=funnel,
        my_active=my_active,
        sla_urgent=sla_urgent_tickets,
        recent_open=recent_open,
        lead_stats=lead_stats,
        lead_pipeline=lead_pipeline,
        leads_follow_up=leads_follow_up,
    )
