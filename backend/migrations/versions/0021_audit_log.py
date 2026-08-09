"""Add audit_logs table — immutable ticket/invoice activity trail

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("invoice_id", sa.String(32), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_label", sa.String(255), nullable=False, server_default=""),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("field", sa.String(100), nullable=True),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_audit_logs_ticket_id", "audit_logs", ["ticket_id"])
    op.create_index("ix_audit_logs_invoice_id", "audit_logs", ["invoice_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade():
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_invoice_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_ticket_id", table_name="audit_logs")
    op.drop_table("audit_logs")
