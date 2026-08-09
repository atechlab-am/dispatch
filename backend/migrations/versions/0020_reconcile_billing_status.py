"""Reconcile ticket billing_status with actual invoice links

Deleting an invoice used to leave its tickets stuck showing "invoiced"/"paid"
even though no invoice referenced them any more (the join rows were removed by
CASCADE but billing_status was not reset). This one-time pass re-derives every
ticket's billing_status from its real invoice_tickets links:

  * no link              -> unbilled
  * linked, none paid    -> invoiced
  * linked to a Paid inv -> paid

Idempotent — safe to re-run.

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-02
"""
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Any ticket with no invoice link is unbilled.
    op.execute("""
        UPDATE tickets SET billing_status = 'unbilled'
        WHERE id NOT IN (SELECT ticket_id FROM invoice_tickets)
    """)
    # 2. Linked tickets default to invoiced.
    op.execute("""
        UPDATE tickets SET billing_status = 'invoiced'
        WHERE id IN (SELECT ticket_id FROM invoice_tickets)
    """)
    # 3. Tickets on at least one Paid invoice are paid (overrides step 2).
    op.execute("""
        UPDATE tickets SET billing_status = 'paid'
        WHERE id IN (
            SELECT it.ticket_id FROM invoice_tickets it
            JOIN invoices i ON i.id = it.invoice_id
            WHERE i.status = 'Paid'
        )
    """)


def downgrade():
    # No-op: this is a data reconciliation, not a schema change.
    pass
