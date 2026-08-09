"""Add font-size and custom-template columns to document_branding.

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("document_branding", sa.Column("font_size_header", sa.Integer, nullable=False, server_default="22"))
    op.add_column("document_branding", sa.Column("font_size_body", sa.Integer, nullable=False, server_default="14"))
    op.add_column("document_branding", sa.Column("font_size_table", sa.Integer, nullable=False, server_default="13"))
    op.add_column("document_branding", sa.Column("font_size_totals", sa.Integer, nullable=False, server_default="15"))
    op.add_column("document_branding", sa.Column("use_custom_invoice_template", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("document_branding", sa.Column("custom_invoice_template", sa.Text, nullable=False, server_default=""))
    op.add_column("document_branding", sa.Column("use_custom_quote_template", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("document_branding", sa.Column("custom_quote_template", sa.Text, nullable=False, server_default=""))


def downgrade():
    op.drop_column("document_branding", "custom_quote_template")
    op.drop_column("document_branding", "use_custom_quote_template")
    op.drop_column("document_branding", "custom_invoice_template")
    op.drop_column("document_branding", "use_custom_invoice_template")
    op.drop_column("document_branding", "font_size_totals")
    op.drop_column("document_branding", "font_size_table")
    op.drop_column("document_branding", "font_size_body")
    op.drop_column("document_branding", "font_size_header")
