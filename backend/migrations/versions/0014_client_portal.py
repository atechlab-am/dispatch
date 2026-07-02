"""Client portal — client_portal_users and portal_refresh_tokens tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "client_portal_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_client_portal_users_id", "client_portal_users", ["id"])
    op.create_index("ix_client_portal_users_email", "client_portal_users", ["email"], unique=True)

    op.create_table(
        "portal_refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("portal_user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["portal_user_id"], ["client_portal_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_portal_refresh_tokens_id", "portal_refresh_tokens", ["id"])
    op.create_index("ix_portal_refresh_tokens_token_hash", "portal_refresh_tokens", ["token_hash"], unique=True)


def downgrade():
    op.drop_table("portal_refresh_tokens")
    op.drop_table("client_portal_users")
