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


class TicketType(str, enum.Enum):
    incident       = "Incident"
    request        = "Request"
    change_request = "Change Request"


class TicketStatus(str, enum.Enum):
    open = "Open"
    in_progress = "In Progress"
    awaiting_client = "Awaiting Client"
    on_hold = "On Hold"
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


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, default="")
    phone = Column(String(50), nullable=False, default="")
    address = Column(Text, nullable=False, default="")
    client_type = Column(SAEnum(ClientType, values_callable=lambda e: [m.value for m in e]), nullable=False, default=ClientType.business)
    company = Column(String(255), nullable=False, default="")
    notes = Column(Text, nullable=False, default="")
    slug = Column(String(100), unique=True, nullable=True, index=True)  # e.g. "acme-corp" → portal at /p/acme-corp
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    tickets = relationship("Ticket", back_populates="client")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole, values_callable=lambda e: [m.value for m in e]), nullable=False, default=UserRole.technician)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    tickets = relationship("Ticket", foreign_keys="Ticket.created_by", back_populates="creator")
    assigned_tickets = relationship("Ticket", foreign_keys="Ticket.assigned_to", back_populates="assignee")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("TicketComment", back_populates="author", cascade="all, delete-orphan")


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

    _enum_vals = staticmethod(lambda e: [m.value for m in e])

    id = Column(String(32), primary_key=True)  # TKT-YYYY-NNNNN
    ticket_type = Column(SAEnum(TicketType, values_callable=_enum_vals), nullable=False, default=TicketType.incident)
    status = Column(SAEnum(TicketStatus, values_callable=_enum_vals), nullable=False, default=TicketStatus.open)
    priority = Column(SAEnum(TicketPriority, values_callable=_enum_vals), nullable=False, default=TicketPriority.medium)
    client_type = Column(SAEnum(ClientType, values_callable=_enum_vals), nullable=False, default=ClientType.business)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_phone = Column(String(50), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    title = Column(String(500), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    internal_notes = Column(Text, nullable=False, default="")
    travel_fee = Column(SAEnum(TravelFee, values_callable=_enum_vals), nullable=False, default=TravelFee.none)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    sla_response_due = Column(DateTime, nullable=True)
    sla_resolution_due = Column(DateTime, nullable=True)
    sla_paused_at = Column(DateTime, nullable=True)  # set when Awaiting Client, cleared on resume
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

    client = relationship("Client", back_populates="tickets")
    creator = relationship("User", foreign_keys=[created_by], back_populates="tickets")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_tickets")
    service_lines = relationship("ServiceLine", back_populates="ticket", cascade="all, delete-orphan")
    hour_logs = relationship("HourLog", back_populates="ticket", cascade="all, delete-orphan")
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketComment.created_at")
    attachments = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketAttachment.created_at")


class InvoiceStatus(str, enum.Enum):
    draft = "Draft"
    sent = "Sent"
    paid = "Paid"
    void = "Void"


class Invoice(Base):
    __tablename__ = "invoices"

    _ev = staticmethod(lambda e: [m.value for m in e])

    id = Column(String(32), primary_key=True)          # INV-YYYY-NNNNN
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default=InvoiceStatus.draft)
    issue_date = Column(Date, nullable=False, default=date.today)
    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=False, default="")
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 4), nullable=False, default=0)  # e.g. 0.14975 for QC
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    total = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    ticket = relationship("Ticket")
    client = relationship("Client")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("InvoicePayment", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(500), nullable=False, default="")
    qty = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)
    amount = Column(Numeric(12, 2), nullable=False, default=0)

    invoice = relationship("Invoice", back_populates="lines")


class ServiceLine(Base):
    __tablename__ = "service_lines"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(100), nullable=False)
    name = Column(String(500), nullable=False)
    type = Column(SAEnum(ServiceLineType, values_callable=lambda e: [m.value for m in e]), nullable=False)
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


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User", back_populates="comments")


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)        # UUID-based stored name
    original_name = Column(String(500), nullable=False)   # original upload filename
    mime_type = Column(String(127), nullable=False)
    size = Column(Integer, nullable=False)                # bytes
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    ticket = relationship("Ticket", back_populates="attachments")
    uploader = relationship("User")


class RecurringInterval(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"


class RecurringTicket(Base):
    __tablename__ = "recurring_tickets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    interval = Column(SAEnum(RecurringInterval, values_callable=lambda e: [m.value for m in e]), nullable=False)
    ticket_type = Column(SAEnum(TicketType, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TicketType.incident)
    client_type = Column(SAEnum(ClientType, values_callable=lambda e: [m.value for m in e]), nullable=False, default=ClientType.business)
    priority = Column(SAEnum(TicketPriority, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TicketPriority.medium)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_phone = Column(String(50), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    title = Column(String(500), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    internal_notes = Column(Text, nullable=False, default="")
    travel_fee = Column(SAEnum(TravelFee, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TravelFee.none)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    next_run = Column(DateTime, nullable=False)
    last_ticket_id = Column(String(32), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    method = Column(String(50), nullable=False, default="")   # cash, cheque, e-transfer, card, other
    note = Column(String(500), nullable=False, default="")
    payment_date = Column(Date, nullable=False, default=date.today)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    invoice = relationship("Invoice", back_populates="payments")


class Document(Base):
    """Playbook entries and client-facing forms stored in the uploads volume."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    category = Column(String(60), nullable=False, default="on_demand_support")
    # comma-separated ticket type values, e.g. "Incident,Service Request"
    ticket_types = Column(Text, nullable=False, default="")
    # comma-separated free-form tags, e.g. "networking,backup"
    tags = Column(Text, nullable=False, default="")
    requires_signature = Column(Boolean, nullable=False, default=False)
    filename = Column(String(255), nullable=False)       # UUID-based name on disk
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False, default="")
    size = Column(Integer, nullable=False, default=0)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class TicketDocument(Base):
    """Links a document to a ticket with acknowledgement and signature tracking."""
    __tablename__ = "ticket_documents"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    acknowledged = Column(Boolean, nullable=False, default=False)
    signature_obtained = Column(Boolean, nullable=False, default=False)
    noted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    noted_at = Column(DateTime, nullable=True)


class FormTemplate(Base):
    """Reusable form definitions with typed fields (stored as JSON)."""
    __tablename__ = "form_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    ticket_types = Column(Text, nullable=False, default="")   # comma-separated
    # JSON array: [{id, label, type, required, options}]
    fields = Column(Text, nullable=False, default="[]")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    instances = relationship("FormInstance", back_populates="template", cascade="all, delete-orphan")


class FormInstance(Base):
    """A filled copy of a FormTemplate, scoped to a ticket."""
    __tablename__ = "form_instances"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("form_templates.id", ondelete="CASCADE"), nullable=False)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    # JSON object: {field_id: value, ...}
    values = Column(Text, nullable=False, default="{}")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    template = relationship("FormTemplate", back_populates="instances")


class ClientPortalUser(Base):
    """Login credentials for client-facing portal accounts."""
    __tablename__ = "client_portal_users"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    client = relationship("Client")
    refresh_tokens = relationship("PortalRefreshToken", back_populates="portal_user", cascade="all, delete-orphan")


class PortalRefreshToken(Base):
    __tablename__ = "portal_refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    portal_user_id = Column(Integer, ForeignKey("client_portal_users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    portal_user = relationship("ClientPortalUser", back_populates="refresh_tokens")


class TicketTemplate(Base):
    __tablename__ = "ticket_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    ticket_type = Column(SAEnum(TicketType, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TicketType.incident)
    client_type = Column(SAEnum(ClientType, values_callable=lambda e: [m.value for m in e]), nullable=False, default=ClientType.business)
    priority = Column(SAEnum(TicketPriority, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TicketPriority.medium)
    title = Column(String(500), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    internal_notes = Column(Text, nullable=False, default="")
    travel_fee = Column(SAEnum(TravelFee, values_callable=lambda e: [m.value for m in e]), nullable=False, default=TravelFee.none)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
