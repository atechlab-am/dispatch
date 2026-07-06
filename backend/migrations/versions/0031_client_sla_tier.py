"""Per-client SLA tiers — optional gold/silver/bronze override of the global
per-priority SLA table.

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clients", sa.Column("sla_tier", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("clients", "sla_tier")
