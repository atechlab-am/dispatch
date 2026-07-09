"""Add ticket_materials table for the ticket Materials Used section.

Revision ID: 0038
Revises: 0037
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ticket_materials",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("material_id", sa.Integer, sa.ForeignKey("materials.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("qty", sa.Integer, nullable=False, server_default="1"),
    )


def downgrade():
    op.drop_table("ticket_materials")
