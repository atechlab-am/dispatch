"""Stripe online payments: relax invoice_payments.recorded_by to nullable
(automated/webhook-recorded payments have no human recorder), add idempotency
and lookup columns for Stripe Checkout.

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("invoice_payments") as batch:
        batch.alter_column("recorded_by", existing_type=sa.Integer, nullable=True)
        batch.add_column(sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True))
        batch.create_unique_constraint("uq_invoice_payments_stripe_payment_intent_id", ["stripe_payment_intent_id"])

    with op.batch_alter_table("invoices") as batch:
        batch.add_column(sa.Column("stripe_checkout_session_id", sa.String(255), nullable=True))


def downgrade():
    with op.batch_alter_table("invoices") as batch:
        batch.drop_column("stripe_checkout_session_id")

    with op.batch_alter_table("invoice_payments") as batch:
        batch.drop_constraint("uq_invoice_payments_stripe_payment_intent_id", type_="unique")
        batch.drop_column("stripe_payment_intent_id")
        batch.alter_column("recorded_by", existing_type=sa.Integer, nullable=False)
