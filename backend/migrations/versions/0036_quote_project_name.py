"""Add project_name to quotes.

Revision ID: 0036
Revises: 0035
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("quotes", sa.Column("project_name", sa.String(255), nullable=False, server_default=""))


def downgrade():
    op.drop_column("quotes", "project_name")
