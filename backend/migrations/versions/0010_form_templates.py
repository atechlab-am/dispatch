"""form_templates and form_instances tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "form_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("ticket_types", sa.Text(), nullable=False, server_default=""),
        sa.Column("fields", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "form_instances",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("form_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("values", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_form_instances_ticket", "form_instances", ["ticket_id"])


def downgrade():
    op.drop_index("ix_form_instances_ticket", "form_instances")
    op.drop_table("form_instances")
    op.drop_table("form_templates")
