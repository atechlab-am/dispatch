"""Add document_branding table (single row) for quote/invoice PDF + email branding.

Revision ID: 0044
Revises: 0043
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_branding",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False, server_default="ATech Solutions"),
        sa.Column("website", sa.String(255), nullable=False, server_default="atechsolutions.org"),
        sa.Column("primary_color", sa.String(20), nullable=False, server_default="#1A5CBA"),
        sa.Column("accent_color", sa.String(20), nullable=False, server_default="#E8A020"),
        sa.Column("logo_url", sa.Text, nullable=False, server_default=""),
        sa.Column("footer_text", sa.String(500), nullable=False, server_default="Thank you for your business"),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_table("document_branding")
