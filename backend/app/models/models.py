from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean, Date,
    DateTime, ForeignKey, Text, Enum as SAEnum, Table
)
from sqlalchemy.orm import relationship
import enum

from ..database import Base


# Many-to-many: invoices ↔ tickets
invoice_tickets = Table(
    "invoice_tickets",
    Base.metadata,
    Column("invoice_id", String(32), ForeignKey("invoices.id", ondelete="CASCADE"), primary_key=True),
    Column("ticket_id",  String(32), ForeignKey("tickets.id",  ondelete="CASCADE"), primary_key=True),
)


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


class ClientSlaTier(str, enum.Enum):
    gold = "gold"
    silver = "silver"
    bronze = "bronze"


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
    sla_tier = Column(SAEnum(ClientSlaTier, values_callable=lambda e: [m.value for m in e]), nullable=True)  # null = use the global per-priority table
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
    totp_secret = Column(String(64), nullable=True)  # base32 secret; null = 2FA not set up
    totp_enabled = Column(Boolean, nullable=False, default=False)
    backup_codes = Column(Text, nullable=True)  # JSON list of bcrypt-hashed one-time backup codes

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
    sla_breach_notified_at = Column(DateTime, nullable=True)  # guards against re-notifying every escalation cycle
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = auto-created (e.g. inbound email)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    billing_status = Column(String(20), nullable=False, default="unbilled")  # unbilled | invoiced | paid

    client = relationship("Client", back_populates="tickets")
    creator = relationship("User", foreign_keys=[created_by], back_populates="tickets")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_tickets")
    service_lines = relationship("ServiceLine", back_populates="ticket", cascade="all, delete-orphan")
    hour_logs = relationship("HourLog", back_populates="ticket", cascade="all, delete-orphan")
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketComment.created_at")
    attachments = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketAttachment.created_at")
    audit_logs = relationship("AuditLog", back_populates="ticket", cascade="all, delete-orphan", order_by="AuditLog.created_at")
    appointments = relationship("Appointment", back_populates="ticket", cascade="all, delete-orphan", order_by="Appointment.start_at")


class InvoiceStatus(str, enum.Enum):
    draft = "Draft"
    sent = "Sent"
    paid = "Paid"
    void = "Void"


class QuoteStatus(str, enum.Enum):
    draft = "Draft"
    sent = "Sent"
    approved = "Approved"
    rejected = "Rejected"
    expired = "Expired"


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(String(32), primary_key=True)          # QUO-YYYY-NNNNN
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default=QuoteStatus.draft)
    issue_date = Column(Date, nullable=False, default=date.today)
    expiry_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=False, default="")
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 4), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    total = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    converted_invoice_id = Column(String(32), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)

    ticket = relationship("Ticket")
    client = relationship("Client")
    lines = relationship("QuoteLine", back_populates="quote", cascade="all, delete-orphan")
    converted_invoice = relationship("Invoice")


class QuoteLine(Base):
    __tablename__ = "quote_lines"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(String(32), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(500), nullable=False, default="")
    qty = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)
    amount = Column(Numeric(12, 2), nullable=False, default=0)

    quote = relationship("Quote", back_populates="lines")


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
    stripe_checkout_session_id = Column(String(255), nullable=True)

    ticket = relationship("Ticket")
    client = relationship("Client")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("InvoicePayment", back_populates="invoice", cascade="all, delete-orphan")
    linked_tickets = relationship("Ticket", secondary="invoice_tickets", lazy="joined")
    audit_logs = relationship("AuditLog", back_populates="invoice", cascade="all, delete-orphan", order_by="AuditLog.created_at")


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
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    is_running = Column(Boolean, nullable=False, default=False)

    ticket = relationship("Ticket", back_populates="hour_logs")


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = non-staff author (e.g. inbound email)
    author_label = Column(String(255), nullable=True)  # denormalized display name/email when author_id is null
    external_message_id = Column(String(255), nullable=True, unique=True)  # inbound email Message-ID, for idempotency
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User", back_populates="comments")


class AuditLog(Base):
    """Immutable record of who changed what on a ticket or invoice, and when.

    No update/delete endpoint is ever exposed for this table — that is what
    makes it an audit trail rather than just another editable log.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True, index=True)
    invoice_id = Column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = system-generated
    actor_label = Column(String(255), nullable=False, default="")
    action = Column(String(50), nullable=False)
    field = Column(String(100), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    ticket = relationship("Ticket", back_populates="audit_logs")
    invoice = relationship("Invoice", back_populates="audit_logs")
    actor = relationship("User")


class Notification(Base):
    """In-app notification for staff — assignments, reassignments, status
    changes, and internal comments on tickets they're assigned to. Staff-only;
    no portal/client equivalent."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True)
    kind = Column(String(50), nullable=False)
    message = Column(String(500), nullable=False)
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
    ticket = relationship("Ticket")


class Appointment(Base):
    """A scheduled on-site visit or technician appointment for a ticket.
    Independent of Ticket.assigned_to — a ticket can have zero, one, or many
    appointments (e.g. an initial visit plus a follow-up)."""
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(32), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=False)
    notes = Column(Text, nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    ticket = relationship("Ticket", back_populates="appointments")
    technician = relationship("User", foreign_keys=[technician_id])


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
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
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


class RecurringInvoice(Base):
    """Schedule that generates an invoice (e.g. a monthly managed-services
    retainer) on a recurring interval. Mirrors RecurringTicket's shape."""
    __tablename__ = "recurring_invoices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    interval = Column(SAEnum(RecurringInterval, values_callable=lambda e: [m.value for m in e]), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    client_name = Column(String(255), nullable=False, default="")
    client_email = Column(String(255), nullable=False, default="")
    client_address = Column(Text, nullable=False, default="")
    tax_rate = Column(Numeric(5, 4), nullable=False, default=0)
    notes = Column(Text, nullable=False, default="")
    auto_send = Column(Boolean, nullable=False, default=False)
    next_run = Column(DateTime, nullable=False)
    last_invoice_id = Column(String(32), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    lines = relationship("RecurringInvoiceLine", back_populates="recurring_invoice", cascade="all, delete-orphan")


class RecurringInvoiceLine(Base):
    """Template line item copied onto each invoice this schedule generates.
    description may contain a literal '{month}' token, interpolated to e.g.
    'July 2026' at generation time."""
    __tablename__ = "recurring_invoice_lines"

    id = Column(Integer, primary_key=True, index=True)
    recurring_invoice_id = Column(Integer, ForeignKey("recurring_invoices.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(500), nullable=False, default="")
    qty = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)

    recurring_invoice = relationship("RecurringInvoice", back_populates="lines")


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    method = Column(String(50), nullable=False, default="")   # cash, cheque, e-transfer, card, other
    note = Column(String(500), nullable=False, default="")
    payment_date = Column(Date, nullable=False, default=date.today)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = automated (e.g. Stripe)
    stripe_payment_intent_id = Column(String(255), nullable=True, unique=True)
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


class CannedResponse(Base):
    __tablename__ = "canned_responses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    body = Column(Text, nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
