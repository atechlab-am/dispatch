"""Email-to-ticket: relax ticket_comments.author_id and tickets.created_by to
nullable (both represent automated/non-staff authorship — inbound email
replies and auto-created tickets have no staff user to attribute), add
author_label + external_message_id for client-authored comment display and
webhook-retry idempotency.

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("ticket_comments") as batch:
        batch.alter_column("author_id", existing_type=sa.Integer, nullable=True)
        batch.add_column(sa.Column("author_label", sa.String(255), nullable=True))
        batch.add_column(sa.Column("external_message_id", sa.String(255), nullable=True))
        batch.create_unique_constraint("uq_ticket_comments_external_message_id", ["external_message_id"])

    with op.batch_alter_table("tickets") as batch:
        batch.alter_column("created_by", existing_type=sa.Integer, nullable=True)


def downgrade():
    with op.batch_alter_table("tickets") as batch:
        batch.alter_column("created_by", existing_type=sa.Integer, nullable=False)

    with op.batch_alter_table("ticket_comments") as batch:
        batch.drop_constraint("uq_ticket_comments_external_message_id", type_="unique")
        batch.drop_column("external_message_id")
        batch.drop_column("author_label")
        batch.alter_column("author_id", existing_type=sa.Integer, nullable=False)
