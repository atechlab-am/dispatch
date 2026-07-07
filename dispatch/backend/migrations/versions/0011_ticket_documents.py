"""ticket_documents table

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ticket_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("signature_obtained", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("noted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("noted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ticket_documents_ticket", "ticket_documents", ["ticket_id"])
    op.create_index("ix_ticket_documents_unique", "ticket_documents", ["ticket_id", "document_id"], unique=True)


def downgrade():
    op.drop_table("ticket_documents")
