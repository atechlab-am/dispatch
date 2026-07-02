"""Expand document categories from 2 to 9 service-based groups

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    # Widen the column to fit the longest new slug
    with op.batch_alter_table("documents") as batch:
        batch.alter_column(
            "category",
            existing_type=sa.String(20),
            type_=sa.String(60),
            existing_nullable=False,
        )

    # Migrate existing values:
    #   "internal"      → "on_demand_support"   (closest generic bucket)
    #   "client_facing" → "client_facing"        (unchanged)
    op.execute(
        "UPDATE documents SET category = 'on_demand_support' WHERE category = 'internal'"
    )


def downgrade():
    # Remap back to the two original values
    op.execute(
        "UPDATE documents SET category = 'internal' WHERE category != 'client_facing'"
    )
    with op.batch_alter_table("documents") as batch:
        batch.alter_column(
            "category",
            existing_type=sa.String(60),
            type_=sa.String(20),
            existing_nullable=False,
        )
