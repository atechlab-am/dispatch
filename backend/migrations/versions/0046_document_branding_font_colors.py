"""Add text_color/muted_color/on_color_text to document_branding.

Revision ID: 0046
Revises: 0045
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("document_branding", sa.Column("text_color", sa.String(20), nullable=False, server_default="#0F172A"))
    op.add_column("document_branding", sa.Column("muted_color", sa.String(20), nullable=False, server_default="#64748B"))
    op.add_column("document_branding", sa.Column("on_color_text", sa.String(20), nullable=False, server_default="#FFFFFF"))


def downgrade():
    op.drop_column("document_branding", "on_color_text")
    op.drop_column("document_branding", "muted_color")
    op.drop_column("document_branding", "text_color")
