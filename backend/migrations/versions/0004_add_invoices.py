"""add invoices table

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use String instead of native Enum type to avoid SQLAlchemy auto-creating the PG type;
    # then add a CHECK constraint so the DB still validates values.
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_address", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="Draft"),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.CheckConstraint("status IN ('Draft', 'Sent', 'Paid', 'Void')", name="ck_invoices_status"),
    )
    op.create_index(op.f("ix_invoices_id"), "invoices", ["id"], unique=False)

    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.String(32), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("qty", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_index(op.f("ix_invoice_lines_id"), "invoice_lines", ["id"], unique=False)


def downgrade() -> None:
    op.drop_table("invoice_lines")
    op.drop_table("invoices")
