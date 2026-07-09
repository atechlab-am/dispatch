"""Backup/restore to NAS: backup_runs history table.

Revision ID: 0035
Revises: 0034
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "backup_runs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("error", sa.Text, nullable=False, server_default=""),
        sa.Column("triggered_by", sa.String(20), nullable=False),
    )


def downgrade():
    op.drop_table("backup_runs")
