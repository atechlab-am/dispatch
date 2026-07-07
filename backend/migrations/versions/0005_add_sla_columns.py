"""add sla columns to tickets

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("sla_response_due", sa.DateTime(), nullable=True))
    op.add_column("tickets", sa.Column("sla_resolution_due", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "sla_resolution_due")
    op.drop_column("tickets", "sla_response_due")
