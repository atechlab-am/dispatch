"""Add must_change_password to client_portal_users

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "client_portal_users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade():
    op.drop_column("client_portal_users", "must_change_password")
