"""Materials catalog + labor/material type on quote lines.

Revision ID: 0033
Revises: 0032
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("quote_lines", sa.Column("item_type", sa.String(20), nullable=False, server_default="Labor"))
    op.create_table(
        "materials",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )


def downgrade():
    op.drop_table("materials")
    op.drop_column("quote_lines", "item_type")
