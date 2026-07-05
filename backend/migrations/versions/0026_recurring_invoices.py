"""Recurring/retainer invoicing — schedules that auto-generate invoices on a
recurring interval, mirroring recurring_tickets.

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recurring_invoices",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("interval", sa.String(20), nullable=False),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_address", sa.Text, nullable=False, server_default=""),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("auto_send", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("next_run", sa.DateTime, nullable=False),
        sa.Column("last_invoice_id", sa.String(32), nullable=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "recurring_invoice_lines",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("recurring_invoice_id", sa.Integer, sa.ForeignKey("recurring_invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("qty", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_index("ix_recurring_invoice_lines_recurring_invoice_id", "recurring_invoice_lines", ["recurring_invoice_id"])


def downgrade():
    op.drop_index("ix_recurring_invoice_lines_recurring_invoice_id", table_name="recurring_invoice_lines")
    op.drop_table("recurring_invoice_lines")
    op.drop_table("recurring_invoices")
