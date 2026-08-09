"""SLA-breach escalation — track when a ticket's breach was last notified so
the background check doesn't re-notify every cycle.

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tickets", sa.Column("sla_breach_notified_at", sa.DateTime, nullable=True))


def downgrade():
    op.drop_column("tickets", "sla_breach_notified_at")
