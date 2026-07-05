"""Scheduling/dispatch calendar — appointments (scheduled technician visits),
independent of ticket assignment.

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("technician_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_at", sa.DateTime, nullable=False),
        sa.Column("end_at", sa.DateTime, nullable=False),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_appointments_ticket_id", "appointments", ["ticket_id"])
    op.create_index("ix_appointments_technician_id", "appointments", ["technician_id"])
    op.create_index("ix_appointments_start_at", "appointments", ["start_at"])


def downgrade():
    op.drop_index("ix_appointments_start_at", table_name="appointments")
    op.drop_index("ix_appointments_technician_id", table_name="appointments")
    op.drop_index("ix_appointments_ticket_id", table_name="appointments")
    op.drop_table("appointments")
