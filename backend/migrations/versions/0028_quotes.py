"""Quotes/estimates — send a quote that can convert to an invoice on approval.

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "quotes",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_address", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="Draft"),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("converted_invoice_id", sa.String(32), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("quote_id", sa.String(32), sa.ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("qty", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_index("ix_quotes_client_id", "quotes", ["client_id"])
    op.create_index("ix_quote_lines_quote_id", "quote_lines", ["quote_id"])


def downgrade():
    op.drop_index("ix_quote_lines_quote_id", table_name="quote_lines")
    op.drop_index("ix_quotes_client_id", table_name="quotes")
    op.drop_table("quote_lines")
    op.drop_table("quotes")
