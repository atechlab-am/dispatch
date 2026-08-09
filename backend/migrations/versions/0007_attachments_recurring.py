"""phase 6b: ticket attachments and recurring tickets

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ticket_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(127), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "recurring_tickets",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("interval", sa.String(16), nullable=False),
        sa.Column("ticket_type", sa.String(32), nullable=False, server_default="Incident"),
        sa.Column("client_type", sa.String(32), nullable=False, server_default="business"),
        sa.Column("priority", sa.String(16), nullable=False, server_default="Medium"),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_phone", sa.String(50), nullable=False, server_default=""),
        sa.Column("client_address", sa.Text(), nullable=False, server_default=""),
        sa.Column("title", sa.String(500), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("internal_notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("travel_fee", sa.String(16), nullable=False, server_default="travel_none"),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("next_run", sa.DateTime(), nullable=False),
        sa.Column("last_ticket_id", sa.String(32), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("recurring_tickets")
    op.drop_table("ticket_attachments")
