"""phase 6: assigned_to, comments, templates

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))

    op.create_table(
        "ticket_comments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "ticket_templates",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("ticket_type", sa.String(32), nullable=False, server_default="Incident"),
        sa.Column("client_type", sa.String(32), nullable=False, server_default="business"),
        sa.Column("priority", sa.String(16), nullable=False, server_default="Medium"),
        sa.Column("title", sa.String(500), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("internal_notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("travel_fee", sa.String(16), nullable=False, server_default="travel_none"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("ticket_templates")
    op.drop_table("ticket_comments")
    op.drop_column("tickets", "assigned_to")
