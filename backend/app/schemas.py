from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from .models.models import TicketType, TicketStatus, TicketPriority, ClientType, TravelFee, ServiceLineType, UserRole, RecurringInterval


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    active: bool

    model_config = {"from_attributes": True}


# ─── Service lines ────────────────────────────────────────────────────────────

class ServiceLineIn(BaseModel):
    service_id: str
    name: str
    type: ServiceLineType
    rate: float = 0
    base: float = 0
    per_unit: float = 0
    per_unit_label: str = ""
    unit_label: str = "unit"
    qty: int = 1
    extra_qty: int = 0


class ServiceLineOut(ServiceLineIn):
    id: int

    model_config = {"from_attributes": True}


# ─── Hour logs ────────────────────────────────────────────────────────────────

class HourLogIn(BaseModel):
    date: date
    hours: float
    rate: float
    description: str = ""


class HourLogOut(HourLogIn):
    id: int

    model_config = {"from_attributes": True}


# ─── Tickets ──────────────────────────────────────────────────────────────────

class TicketIn(BaseModel):
    client_id: Optional[int] = None
    assigned_to: Optional[int] = None
    ticket_type: TicketType = TicketType.incident
    status: TicketStatus = TicketStatus.open
    priority: TicketPriority = TicketPriority.medium
    client_type: ClientType = ClientType.business
    client_name: str = Field("", max_length=255)
    client_email: str = Field("", max_length=255)
    client_phone: str = Field("", max_length=50)
    client_address: str = Field("", max_length=500)
    title: str = Field("", max_length=500)
    description: str = Field("", max_length=20000)
    internal_notes: str = Field("", max_length=20000)
    travel_fee: TravelFee = TravelFee.none
    service_lines: list[ServiceLineIn] = Field(default=[], max_length=100)
    hour_logs: list[HourLogIn] = Field(default=[], max_length=500)


class TicketOut(BaseModel):
    id: str
    client_id: Optional[int] = None
    assigned_to: Optional[int] = None
    ticket_type: TicketType
    status: TicketStatus
    priority: TicketPriority
    client_type: ClientType
    client_name: str
    client_email: str
    client_phone: str
    client_address: str
    title: str
    description: str
    internal_notes: str
    travel_fee: TravelFee
    created_at: datetime
    updated_at: datetime
    created_by: int
    sla_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None
    sla_paused_at: Optional[datetime] = None
    service_lines: list[ServiceLineOut] = []
    hour_logs: list[HourLogOut] = []

    model_config = {"from_attributes": True}


class TicketListItem(BaseModel):
    id: str
    ticket_type: TicketType
    status: TicketStatus
    priority: TicketPriority
    client_type: ClientType
    client_name: str
    title: str
    created_at: datetime
    updated_at: datetime
    created_by: int
    assigned_to: Optional[int] = None
    sla_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TicketsPage(BaseModel):
    items: list[TicketListItem]
    total: int
    page: int
    page_size: int


# ─── Comments ─────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)
    is_internal: bool = False


class CommentOut(BaseModel):
    id: int
    ticket_id: str
    author_id: int
    author_name: str
    body: str
    is_internal: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Templates ────────────────────────────────────────────────────────────────

class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    ticket_type: TicketType = TicketType.incident
    client_type: ClientType = ClientType.business
    priority: TicketPriority = TicketPriority.medium
    title: str = Field("", max_length=500)
    description: str = Field("", max_length=20000)
    internal_notes: str = Field("", max_length=20000)
    travel_fee: TravelFee = TravelFee.none


class TemplateOut(TemplateIn):
    id: int
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Attachments ──────────────────────────────────────────────────────────────

class AttachmentOut(BaseModel):
    id: int
    ticket_id: str
    filename: str
    original_name: str
    mime_type: str
    size: int
    uploaded_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Recurring tickets ────────────────────────────────────────────────────────

class RecurringIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    active: bool = True
    interval: RecurringInterval
    ticket_type: TicketType = TicketType.incident
    client_type: ClientType = ClientType.business
    priority: TicketPriority = TicketPriority.medium
    client_id: Optional[int] = None
    client_name: str = Field("", max_length=255)
    client_email: str = Field("", max_length=255)
    client_phone: str = Field("", max_length=50)
    client_address: str = Field("", max_length=500)
    title: str = Field("", max_length=500)
    description: str = Field("", max_length=20000)
    internal_notes: str = Field("", max_length=20000)
    travel_fee: TravelFee = TravelFee.none
    assigned_to: Optional[int] = None


class RecurringOut(RecurringIn):
    id: int
    next_run: datetime
    last_ticket_id: Optional[str] = None
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}
