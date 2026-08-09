"""Add timer columns to hour_logs — a running timer is an HourLog row with
started_at set and is_running true, ended_at/hours filled in on stop.

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("hour_logs") as batch:
        batch.add_column(sa.Column("started_at", sa.DateTime, nullable=True))
        batch.add_column(sa.Column("ended_at", sa.DateTime, nullable=True))
        batch.add_column(sa.Column("is_running", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("hour_logs") as batch:
        batch.drop_column("is_running")
        batch.drop_column("ended_at")
        batch.drop_column("started_at")
