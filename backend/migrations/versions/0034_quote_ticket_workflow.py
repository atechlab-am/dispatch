"""Quote -> Ticket -> Invoice workflow.

No schema changes: the workflow is powered entirely by the existing
Quote.ticket_id / Quote.converted_invoice_id columns plus a new
ticket_id query filter on GET /quotes. Kept as a real (empty) migration
so the sequential numbering stays intact and this decision is documented
in the migration history.

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
