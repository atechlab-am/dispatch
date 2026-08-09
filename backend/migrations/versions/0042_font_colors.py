"""Add font color columns (text_color, muted_color, on_color_text) to all
three branding tables.

Revision ID: 0042
Revises: 0041
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

TABLES = ["branding", "login_branding", "portal_branding"]


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column("text_color", sa.String(20), nullable=False, server_default="#0D1B2A"))
        op.add_column(table, sa.Column("muted_color", sa.String(20), nullable=False, server_default="#5B6D82"))
        op.add_column(table, sa.Column("on_color_text", sa.String(20), nullable=False, server_default="#FFFFFF"))


def downgrade():
    for table in TABLES:
        op.drop_column(table, "on_color_text")
        op.drop_column(table, "muted_color")
        op.drop_column(table, "text_color")
