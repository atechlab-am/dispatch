from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from .models.models import TicketType, TicketStatus, TicketPriority, ClientType, TravelFee, ServiceLineType


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
    sla_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TicketsPage(BaseModel):
    items: list[TicketListItem]
    total: int
    page: int
    page_size: int
