"""Add login_branding and portal_branding tables (single row each).

Revision ID: 0041
Revises: 0040
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "login_branding",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False, server_default="Your Company"),
        sa.Column("subtitle", sa.String(255), nullable=False, server_default="internal use only"),
        sa.Column("primary_color", sa.String(20), nullable=False, server_default="#2563EB"),
        sa.Column("accent_color", sa.String(20), nullable=False, server_default="#F59E0B"),
        sa.Column("logo_url", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_table(
        "portal_branding",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False, server_default="Your Company"),
        sa.Column("primary_color", sa.String(20), nullable=False, server_default="#2563EB"),
        sa.Column("accent_color", sa.String(20), nullable=False, server_default="#F59E0B"),
        sa.Column("logo_url", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_table("portal_branding")
    op.drop_table("login_branding")
