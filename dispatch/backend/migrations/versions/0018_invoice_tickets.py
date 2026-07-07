"""invoice_tickets: many-to-many invoice↔ticket + billing_status on tickets

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    # 1. billing_status on tickets
    with op.batch_alter_table("tickets") as batch:
        batch.add_column(sa.Column("billing_status", sa.String(20), nullable=True, server_default="unbilled"))

    # Backfill any NULLs that slipped through (rows existing before column was added)
    op.execute("UPDATE tickets SET billing_status = 'unbilled' WHERE billing_status IS NULL")

    # 2. join table  invoice_tickets
    op.create_table(
        "invoice_tickets",
        sa.Column("invoice_id", sa.String(32), sa.ForeignKey("invoices.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ticket_id",  sa.String(32), sa.ForeignKey("tickets.id",  ondelete="CASCADE"), primary_key=True),
    )

    # 3. Migrate existing single-ticket link to the join table
    op.execute("""
        INSERT INTO invoice_tickets (invoice_id, ticket_id)
        SELECT id, ticket_id FROM invoices
        WHERE ticket_id IS NOT NULL
    """)


def downgrade():
    op.drop_table("invoice_tickets")
    with op.batch_alter_table("tickets") as batch:
        batch.drop_column("billing_status")
