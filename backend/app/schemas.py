from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr


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

    model_config = {"from_attributes": True}


# ─── Service lines ────────────────────────────────────────────────────────────

class ServiceLineIn(BaseModel):
    service_id: str
    name: str
    type: str
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
    status: str = "Open"
    priority: str = "Medium"
    client_type: str = "business"
    client_name: str = ""
    client_email: str = ""
    client_phone: str = ""
    client_address: str = ""
    title: str = ""
    description: str = ""
    internal_notes: str = ""
    travel_fee: str = "travel_none"
    service_lines: list[ServiceLineIn] = []
    hour_logs: list[HourLogIn] = []


class TicketOut(BaseModel):
    id: str
    status: str
    priority: str
    client_type: str
    client_name: str
    client_email: str
    client_phone: str
    client_address: str
    title: str
    description: str
    internal_notes: str
    travel_fee: str
    created_at: datetime
    updated_at: datetime
    created_by: int
    service_lines: list[ServiceLineOut] = []
    hour_logs: list[HourLogOut] = []

    model_config = {"from_attributes": True}


class TicketListItem(BaseModel):
    id: str
    status: str
    priority: str
    client_type: str
    client_name: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TicketsPage(BaseModel):
    items: list[TicketListItem]
    total: int
    page: int
    page_size: int
