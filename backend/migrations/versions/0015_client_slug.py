"""Add slug column to clients for client portal URL

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clients", sa.Column("slug", sa.String(100), nullable=True))
    op.create_index("ix_clients_slug", "clients", ["slug"], unique=True)


def downgrade():
    op.drop_index("ix_clients_slug", table_name="clients")
    op.drop_column("clients", "slug")
