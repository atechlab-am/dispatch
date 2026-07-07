"""Add On Hold ticket status

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-30
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'On Hold'")


def downgrade():
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass
