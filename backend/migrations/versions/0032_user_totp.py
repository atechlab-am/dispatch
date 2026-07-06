"""Two-factor auth (TOTP) for staff logins.

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("backup_codes", sa.Text, nullable=True))


def downgrade():
    op.drop_column("users", "backup_codes")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
