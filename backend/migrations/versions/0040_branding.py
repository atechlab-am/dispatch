"""Add branding table (company-wide appearance settings, single row).

Revision ID: 0040
Revises: 0039
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "branding",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False, server_default="Your Company"),
        sa.Column("tagline", sa.String(255), nullable=False, server_default=""),
        sa.Column("primary_color", sa.String(20), nullable=False, server_default="#2563EB"),
        sa.Column("accent_color", sa.String(20), nullable=False, server_default="#F59E0B"),
        sa.Column("logo_url", sa.Text, nullable=False, server_default=""),
        sa.Column("favicon_url", sa.Text, nullable=False, server_default=""),
        sa.Column("sidebar_dark", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_table("branding")
