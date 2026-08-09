"""Ticket work_location + needs_scheduling, Lead follow_up_scheduled, and
extend Appointment to also support lead follow-up reminders (ticket_id made
nullable, lead_id added, exactly-one-of check constraint).

Revision ID: 0047
Revises: 0046
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tickets") as batch:
        batch.add_column(sa.Column("work_location", sa.String(20), nullable=False, server_default="on_site"))
        batch.add_column(sa.Column("needs_scheduling", sa.Boolean, nullable=False, server_default=sa.true()))

    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("follow_up_scheduled", sa.Boolean, nullable=False, server_default=sa.false()))

    with op.batch_alter_table("appointments") as batch:
        batch.alter_column("ticket_id", existing_type=sa.String(32), nullable=True)
        batch.add_column(sa.Column("lead_id", sa.Integer, sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=True))
        batch.create_check_constraint(
            "ck_appointment_exactly_one_of_ticket_or_lead",
            "(ticket_id IS NOT NULL AND lead_id IS NULL) OR (ticket_id IS NULL AND lead_id IS NOT NULL)",
        )
    op.create_index("ix_appointments_lead_id", "appointments", ["lead_id"])


def downgrade():
    op.drop_index("ix_appointments_lead_id", table_name="appointments")
    with op.batch_alter_table("appointments") as batch:
        batch.drop_constraint("ck_appointment_exactly_one_of_ticket_or_lead", type_="check")
        batch.drop_column("lead_id")
        batch.alter_column("ticket_id", existing_type=sa.String(32), nullable=False)

    with op.batch_alter_table("leads") as batch:
        batch.drop_column("follow_up_scheduled")

    with op.batch_alter_table("tickets") as batch:
        batch.drop_column("needs_scheduling")
        batch.drop_column("work_location")
