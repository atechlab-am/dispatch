"""Add category to materials.

Revision ID: 0037
Revises: 0036
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("materials", sa.Column("category", sa.String(120), nullable=False, server_default=""))


def downgrade():
    op.drop_column("materials", "category")
