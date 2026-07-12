import csv
import io
import re
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import (
    Client, Lead, LeadActivity, LeadActivityType, LeadPriority, LeadSource, LeadStage,
    OutreachChannel, User,
)
from ..security import get_current_user
from .. import config

MAX_IMPORT_SIZE = 2 * 1024 * 1024  # 2 MB
MAX_IMPORT_ROWS = 5000
REQUIRED_COLUMNS = {"business_name"}

router = APIRouter(prefix="/leads", tags=["leads"])


def _require_enabled():
    if not config.FEATURE_LEADS:
        raise HTTPException(status_code=503, detail="This feature is disabled")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LeadBase(BaseModel):
    business_name: str = Field(..., max_length=255)
    title: str = Field("", max_length=255)
    industry: str = Field("", max_length=120)
    address: str = Field("", max_length=500)
    area: str = Field("", max_length=120)
    phone: str = Field("", max_length=50)
    website: str = Field("", max_length=500)
    contact_name: str = Field("", max_length=255)
    contact_email: str = Field("", max_length=255)
    contact_phone: str = Field("", max_length=50)
    source: LeadSource = LeadSource.other
    priority: LeadPriority = LeadPriority.medium
    outreach_channel: Optional[OutreachChannel] = None
    value_estimate: Optional[float] = None
    date_contacted: Optional[date] = None
    follow_up_date: Optional[date] = None
    notes: str = Field("", max_length=5000)


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    business_name: Optional[str] = Field(None, max_length=255)
    title: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=500)
    area: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = Field(None, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=255)
    contact_email: Optional[str] = Field(None, max_length=255)
    contact_phone: Optional[str] = Field(None, max_length=50)
    source: Optional[LeadSource] = None
    priority: Optional[LeadPriority] = None
    outreach_channel: Optional[OutreachChannel] = None
    value_estimate: Optional[float] = None
    date_contacted: Optional[date] = None
    follow_up_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)


class LeadOut(LeadBase):
    id: int
    stage: LeadStage
    lost_reason: str
    owner_id: Optional[int] = None
    converted_client_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LeadStageMove(BaseModel):
    stage: LeadStage
    lost_reason: str = Field("", max_length=2000)


class LeadBulkUpdate(BaseModel):
    lead_ids: list[int] = Field(..., min_length=1, max_length=500)
    priority: Optional[LeadPriority] = None
    stage: Optional[LeadStage] = None
    outreach_channel: Optional[OutreachChannel] = None
    date_contacted: Optional[date] = None
    follow_up_date: Optional[date] = None


class LeadBulkDelete(BaseModel):
    lead_ids: list[int] = Field(..., min_length=1, max_length=500)


class LeadBulkResult(BaseModel):
    updated: int


class LeadDuplicateMatch(BaseModel):
    id: int
    business_name: str
    website: str
    phone: str
    stage: LeadStage
    matched_on: list[str]


class LeadActivityIn(BaseModel):
    type: LeadActivityType
    body: str = Field("", max_length=5000)


class LeadActivityOut(BaseModel):
    id: int
    lead_id: int
    user_id: Optional[int] = None
    type: LeadActivityType
    body: str
    occurred_at: datetime
    model_config = {"from_attributes": True}


# ─── Duplicate detection helpers ────────────────────────────────────────────

_LEGAL_SUFFIXES = (" inc", " llc", " ltd", " corp", " co")


def _normalize_name(v: str) -> str:
    v = v.strip().lower()
    for suffix in _LEGAL_SUFFIXES:
        if v.endswith(suffix):
            v = v[: -len(suffix)]
    return v.strip()


def _normalize_website(v: str) -> str:
    v = v.strip().lower()
    v = re.sub(r"^https?://", "", v)
    v = re.sub(r"^www\.", "", v)
    return v.rstrip("/")


def _normalize_phone(v: str) -> str:
    return re.sub(r"\D", "", v)


# ─── Routes — static paths declared before /{lead_id} ───────────────────────

@router.get("", response_model=list[LeadOut])
def list_leads(
    stage: Optional[LeadStage] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_enabled()
    q = db.query(Lead)
    if stage:
        q = q.filter(Lead.stage == stage)
    return q.order_by(Lead.created_at.desc()).all()


@router.get("/check-duplicates", response_model=list[LeadDuplicateMatch])
def check_duplicates(
    business_name: str = Query(""),
    website: str = Query(""),
    phone: str = Query(""),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Checked against all leads regardless of stage (including lost), so a
    rep doesn't re-contact a business that was already tried and lost."""
    _require_enabled()
    name_q = _normalize_name(business_name)
    website_q = _normalize_website(website)
    phone_q = _normalize_phone(phone)

    if not name_q and not website_q and not phone_q:
        return []

    matches: list[LeadDuplicateMatch] = []
    for lead in db.query(Lead).all():
        matched_on: list[str] = []
        lead_name = _normalize_name(lead.business_name)
        if name_q and len(name_q) >= 3 and lead_name and (name_q in lead_name or lead_name in name_q):
            matched_on.append("business_name")
        lead_website = _normalize_website(lead.website)
        if website_q and lead_website and website_q == lead_website:
            matched_on.append("website")
        lead_phone = _normalize_phone(lead.phone)
        if phone_q and lead_phone and phone_q == lead_phone:
            matched_on.append("phone")
        if matched_on:
            matches.append(LeadDuplicateMatch(
                id=lead.id, business_name=lead.business_name, website=lead.website,
                phone=lead.phone, stage=lead.stage, matched_on=matched_on,
            ))
    return matches


@router.post("", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
def create_lead(
    body: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    now = datetime.now(timezone.utc)
    lead = Lead(
        business_name=body.business_name,
        title=body.title or body.business_name,
        industry=body.industry, address=body.address, area=body.area,
        phone=body.phone, website=body.website,
        contact_name=body.contact_name, contact_email=body.contact_email, contact_phone=body.contact_phone,
        source=body.source, priority=body.priority, outreach_channel=body.outreach_channel,
        value_estimate=body.value_estimate, date_contacted=body.date_contacted, follow_up_date=body.follow_up_date,
        notes=body.notes, owner_id=current_user.id, created_at=now, updated_at=now,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.post("/bulk-update", response_model=LeadBulkResult)
def bulk_update_leads(
    body: LeadBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    if body.stage == LeadStage.lost:
        raise HTTPException(status_code=422, detail="Bulk-moving to Lost is not allowed — each lead needs its own reason")

    leads = db.query(Lead).filter(Lead.id.in_(body.lead_ids)).all()
    now = datetime.now(timezone.utc)
    for lead in leads:
        if body.priority is not None:
            lead.priority = body.priority
        if body.outreach_channel is not None:
            lead.outreach_channel = body.outreach_channel
        if body.date_contacted is not None:
            lead.date_contacted = body.date_contacted
        if body.follow_up_date is not None:
            lead.follow_up_date = body.follow_up_date
        if body.stage is not None and body.stage != lead.stage:
            prev = lead.stage
            lead.stage = body.stage
            lead.lost_reason = ""
            db.add(LeadActivity(
                lead_id=lead.id, user_id=current_user.id, type=LeadActivityType.stage_change,
                body=f"Stage moved from {prev.value} to {body.stage.value} (bulk update)", occurred_at=now,
            ))
        lead.updated_at = now
    db.commit()
    return LeadBulkResult(updated=len(leads))


@router.post("/bulk-delete", response_model=LeadBulkResult)
def bulk_delete_leads(
    body: LeadBulkDelete,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_enabled()
    leads = db.query(Lead).filter(Lead.id.in_(body.lead_ids)).all()
    count = len(leads)
    for lead in leads:
        db.delete(lead)
    db.commit()
    return LeadBulkResult(updated=count)


SAMPLE_HEADERS = [
    "Priority", "Business Name", "Category", "Area", "Address", "Phone", "Website",
    "Contact Name", "Email", "Outreach Channel", "Date Contacted", "Follow-Up Date", "Status", "Notes",
]

SAMPLE_ROWS = [
    ["High", "Acme Plumbing", "Plumbing", "Downtown", "123 Main St", "555-0100", "acmeplumbing.com",
     "Jane Doe", "jane@acmeplumbing.com", "Phone", "2026-06-01", "2026-06-15", "Contacted", "Referred by a past client"],
    ["Medium", "Riverside Dental", "Dental", "Riverside", "456 Oak Ave", "555-0101", "riversidedental.com",
     "John Smith", "john@riversidedental.com", "Email", "", "2026-06-20", "New", ""],
    ["Low", "Downtown Gym", "Fitness", "Downtown", "789 Elm St", "", "", "", "", "", "", "", "New", "Found at trade show"],
]

IMPORT_EXPORT_COLUMNS = [
    "id", "business_name", "title", "industry", "area", "address", "phone", "website",
    "contact_name", "contact_email", "contact_phone", "priority", "source", "outreach_channel",
    "date_contacted", "follow_up_date", "stage", "lost_reason", "value_estimate", "notes",
]

HEADER_ALIASES = {
    "business name": "business_name", "company name": "business_name", "company": "business_name", "name": "business_name",
    "title": "title",
    "category": "industry", "industry": "industry",
    "area": "area",
    "address": "address",
    "phone": "phone", "phone number": "phone",
    "website": "website",
    "contact name": "contact_name",
    "email": "contact_email", "contact email": "contact_email",
    "contact phone": "contact_phone",
    "outreach channel": "outreach_channel",
    "date contacted": "date_contacted",
    "follow-up date": "follow_up_date", "follow up date": "follow_up_date",
    "status": "stage", "stage": "stage",
    "notes": "notes",
    "priority": "priority",
    "source": "source",
    "value estimate": "value_estimate", "value_estimate": "value_estimate",
}

PRIORITY_ALIASES = {"h": "high", "hi": "high", "m": "medium", "med": "medium", "mid": "medium", "l": "low", "lo": "low"}
SOURCE_ALIASES = {
    "ref": "referral", "referal": "referral", "web": "website",
    "cold": "outbound", "cold outreach": "outbound", "cold call": "outbound", "outbound call": "outbound",
    "conference": "event", "trade show": "event",
}
OUTREACH_ALIASES = {"e mail": "email", "mail": "email", "call": "phone", "telephone": "phone", "in person": "in_person", "inperson": "in_person", "visit": "in_person"}
STAGE_ALIASES = {"not contacted": "new", "uncontacted": "new"}


def _normalize_header(h: str) -> str:
    return re.sub(r"[\s_-]+", " ", h.strip().lower()).strip()


def _resolve_enum_alias(raw: str, aliases: dict, enum_cls) -> Optional[str]:
    v = re.sub(r"\s+", " ", raw.strip().lower())
    if not v:
        return None
    v = aliases.get(v, v)
    try:
        return enum_cls(v).value
    except ValueError:
        return "INVALID"


@router.get("/import/sample")
def download_sample_csv(_: User = Depends(get_current_user)):
    _require_enabled()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(SAMPLE_HEADERS)
    writer.writerows(SAMPLE_ROWS)
    from fastapi.responses import Response
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads-import-sample.csv"},
    )


@router.get("/export")
def export_leads_csv(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_enabled()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(IMPORT_EXPORT_COLUMNS)
    for lead in db.query(Lead).order_by(Lead.created_at.desc()).all():
        writer.writerow([
            lead.id, lead.business_name, lead.title, lead.industry, lead.area, lead.address,
            lead.phone, lead.website, lead.contact_name, lead.contact_email, lead.contact_phone,
            lead.priority.value, lead.source.value, lead.outreach_channel.value if lead.outreach_channel else "",
            lead.date_contacted.isoformat() if lead.date_contacted else "",
            lead.follow_up_date.isoformat() if lead.follow_up_date else "",
            lead.stage.value, lead.lost_reason,
            str(lead.value_estimate) if lead.value_estimate is not None else "",
            lead.notes,
        ])
    from fastapi.responses import Response
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


@router.post("/import")
async def import_leads_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-create leads from a CSV. Tolerant of human-readable spreadsheet
    headers, common enum shorthand, and Excel/Windows encodings. Validates
    every row before writing anything — a single bad file can't half-import."""
    _require_enabled()

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 2 MB limit")

    text = None
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            text = contents.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = contents.decode("cp1252", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    header_map = {}  # raw header -> internal field name
    for h in reader.fieldnames:
        if not h:
            continue
        normalized = _normalize_header(h)
        internal = HEADER_ALIASES.get(normalized)
        if internal:
            header_map[h] = internal

    if "business_name" not in header_map.values():
        raise HTTPException(status_code=400, detail="Missing required column: business_name")

    rows = list(reader)
    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"Too many rows (max {MAX_IMPORT_ROWS})")

    to_create: list[Lead] = []
    errors: list[dict] = []
    now = datetime.now(timezone.utc)

    for i, raw_row in enumerate(rows):
        row_num = i + 2
        row = {}
        for raw_key, raw_val in raw_row.items():
            internal = header_map.get(raw_key)
            if internal:
                row[internal] = (raw_val or "").strip()

        business_name = row.get("business_name", "")
        if not business_name:
            errors.append({"row": row_num, "error": "Missing business_name"})
            continue

        row_error = None
        priority = LeadPriority.medium
        if row.get("priority"):
            resolved = _resolve_enum_alias(row["priority"], PRIORITY_ALIASES, LeadPriority)
            if resolved == "INVALID":
                row_error = f"Invalid priority: {row['priority']!r}"
            else:
                priority = LeadPriority(resolved)

        source = LeadSource.other
        if not row_error and row.get("source"):
            resolved = _resolve_enum_alias(row["source"], SOURCE_ALIASES, LeadSource)
            if resolved == "INVALID":
                row_error = f"Invalid source: {row['source']!r}"
            else:
                source = LeadSource(resolved)

        outreach_channel = None
        if not row_error and row.get("outreach_channel"):
            resolved = _resolve_enum_alias(row["outreach_channel"], OUTREACH_ALIASES, OutreachChannel)
            if resolved == "INVALID":
                row_error = f"Invalid outreach_channel: {row['outreach_channel']!r}"
            else:
                outreach_channel = OutreachChannel(resolved)

        stage = LeadStage.new
        if not row_error and row.get("stage"):
            resolved = _resolve_enum_alias(row["stage"], STAGE_ALIASES, LeadStage)
            if resolved == "INVALID":
                row_error = f"Invalid stage: {row['stage']!r}"
            else:
                stage = LeadStage(resolved)

        value_estimate = None
        if not row_error and row.get("value_estimate"):
            try:
                value_estimate = float(row["value_estimate"].lstrip("$").replace(",", ""))
            except ValueError:
                row_error = f"Invalid value_estimate: {row['value_estimate']!r}"

        date_contacted = None
        if not row_error and row.get("date_contacted"):
            try:
                date_contacted = date.fromisoformat(row["date_contacted"])
            except ValueError:
                row_error = f"Invalid date_contacted: {row['date_contacted']!r}"

        follow_up_date = None
        if not row_error and row.get("follow_up_date"):
            try:
                follow_up_date = date.fromisoformat(row["follow_up_date"])
            except ValueError:
                row_error = f"Invalid follow_up_date: {row['follow_up_date']!r}"

        if row_error:
            errors.append({"row": row_num, "error": row_error})
            continue

        to_create.append(Lead(
            business_name=business_name,
            title=row.get("title") or business_name,
            industry=row.get("industry", ""), area=row.get("area", ""), address=row.get("address", ""),
            phone=row.get("phone", ""), website=row.get("website", ""),
            contact_name=row.get("contact_name", ""), contact_email=row.get("contact_email", ""),
            contact_phone=row.get("contact_phone", ""),
            priority=priority, source=source, outreach_channel=outreach_channel, stage=stage,
            value_estimate=value_estimate, date_contacted=date_contacted, follow_up_date=follow_up_date,
            notes=row.get("notes", ""), owner_id=current_user.id, created_at=now, updated_at=now,
        ))

    for lead in to_create:
        db.add(lead)
    db.commit()

    return {"created": len(to_create), "errors": errors}


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    body: LeadUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return lead


@router.post("/{lead_id}/stage", response_model=LeadOut)
def move_lead_stage(
    lead_id: int,
    body: LeadStageMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if body.stage == LeadStage.lost and not body.lost_reason.strip():
        raise HTTPException(status_code=422, detail="A reason is required when moving to Lost")

    prev = lead.stage
    lead.stage = body.stage
    lead.lost_reason = body.lost_reason if body.stage == LeadStage.lost else ""
    lead.updated_at = datetime.now(timezone.utc)
    if prev != body.stage:
        db.add(LeadActivity(
            lead_id=lead.id, user_id=current_user.id, type=LeadActivityType.stage_change,
            body=f"Stage moved from {prev.value} to {body.stage.value}", occurred_at=lead.updated_at,
        ))
    db.commit()
    db.refresh(lead)
    return lead


@router.post("/{lead_id}/convert", status_code=status.HTTP_201_CREATED)
def convert_lead_to_client(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Won leads only — creates a Client from the lead's business/contact
    info, marks the lead converted, and logs the conversion on the lead's own
    activity timeline (leads have no separate audit trail)."""
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.stage != LeadStage.won:
        raise HTTPException(status_code=400, detail="Only Won leads can be converted to a Client")
    if lead.converted_client_id:
        raise HTTPException(status_code=400, detail="Lead was already converted to a Client")

    client = Client(
        name=lead.business_name, email=lead.contact_email, phone=lead.contact_phone or lead.phone,
        address=lead.address, company=lead.business_name, notes=lead.notes,
    )
    db.add(client)
    db.flush()
    lead.converted_client_id = client.id
    lead.updated_at = datetime.now(timezone.utc)
    db.add(LeadActivity(
        lead_id=lead.id, user_id=current_user.id, type=LeadActivityType.note,
        body=f"Converted to Client #{client.id}", occurred_at=lead.updated_at,
    ))
    db.commit()
    db.refresh(client)
    return {"client_id": client.id}


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.delete(lead)
    db.commit()


@router.get("/{lead_id}/activities", response_model=list[LeadActivityOut])
def list_lead_activities(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return db.query(LeadActivity).filter(LeadActivity.lead_id == lead_id).order_by(LeadActivity.occurred_at.desc()).all()


@router.post("/{lead_id}/activities", response_model=LeadActivityOut, status_code=status.HTTP_201_CREATED)
def add_lead_activity(
    lead_id: int,
    body: LeadActivityIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if body.type == LeadActivityType.stage_change:
        raise HTTPException(status_code=422, detail="stage_change activities are system-generated only")
    activity = LeadActivity(
        lead_id=lead_id, user_id=current_user.id, type=body.type, body=body.body,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity
