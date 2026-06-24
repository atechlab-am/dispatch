from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean, Date,
    DateTime, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
import enum

from ..database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    technician = "technician"


class TicketStatus(str, enum.Enum):
    open = "Open"
    in_progress = "In Progress"
    awaiting_client = "Awaiting Client"
    resolved = "Resolved"
    closed = "Closed"


class TicketPriority(str, enum.Enum):
    low = "Low"
    medium = "Medium"
    high = "High"
    urgent = "Urgent"


class ClientType(str, enum.Enum):
    business = "business"
    residential = "residential"


class TravelFee(str, enum.Enum):
    none = "travel_none"
    within_15 = "travel_15"
    within_30 = "travel_30"
    over_30 = "travel_30p"


class ServiceLineType(str, enum.Enum):
    flat = "flat"
    per_unit = "per_unit"
    hourly = "hourly"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.technician)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    tickets = relationship("Ticket", back_populates="creator")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="refresh_tokens")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String(32), primary_key=True)  # TKT-YYYY-NNNNN
    status = Column(SAEnum(TicketStatus), nullable=False, default=TicketStatus.open)
    priority = Column(SAEnum(TicketPriority), nullable=False, default=TicketPriority.medium)
    client_type = Column(SAEnum(ClientType), nullable=False, default=ClientType.business)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_phone = Column(String(50), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    title = Column(String(500), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    internal_notes = Column(Text, nullable=False, default="")
    travel_fee = Column(SAEnum(TravelFee), nullable=False, default=TravelFee.none)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    creator = relationship("User", back_populates="tickets")
    service_lines = relationship("ServiceLine", back_populates="ticket", cascade="all, delete-orphan")
    hour_logs = relationship("HourLog", back_populates="ticket", cascade="all, delete-orphan")


class ServiceLine(Base):
    __tablename__ = "service_lines"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(100), nullable=False)
    name = Column(String(500), nullable=False)
    type = Column(SAEnum(ServiceLineType), nullable=False)
    rate = Column(Numeric(10, 2), nullable=False, default=0)
    base = Column(Numeric(10, 2), nullable=False, default=0)
    per_unit = Column(Numeric(10, 2), nullable=False, default=0)
    per_unit_label = Column(String(255), nullable=False, default="")
    unit_label = Column(String(100), nullable=False, default="unit")
    qty = Column(Integer, nullable=False, default=1)
    extra_qty = Column(Integer, nullable=False, default=0)

    ticket = relationship("Ticket", back_populates="service_lines")


class HourLog(Base):
    __tablename__ = "hour_logs"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    hours = Column(Numeric(6, 2), nullable=False, default=0)
    rate = Column(Numeric(10, 2), nullable=False, default=0)
    description = Column(Text, nullable=False, default="")

    ticket = relationship("Ticket", back_populates="hour_logs")
