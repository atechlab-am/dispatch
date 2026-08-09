"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "technician", name="userrole"),
            nullable=False,
        ),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_refresh_tokens_token_hash"),
        "refresh_tokens",
        ["token_hash"],
        unique=True,
    )

    op.create_table(
        "tickets",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "Open",
                "In Progress",
                "Awaiting Client",
                "Resolved",
                "Closed",
                name="ticketstatus",
            ),
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.Enum("Low", "Medium", "High", "Urgent", name="ticketpriority"),
            nullable=False,
        ),
        sa.Column(
            "client_type",
            sa.Enum("business", "residential", name="clienttype"),
            nullable=False,
        ),
        sa.Column("client_name", sa.String(length=255), nullable=False),
        sa.Column("client_email", sa.String(length=255), nullable=False),
        sa.Column("client_phone", sa.String(length=50), nullable=False),
        sa.Column("client_address", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("internal_notes", sa.Text(), nullable=False),
        sa.Column(
            "travel_fee",
            sa.Enum(
                "travel_none",
                "travel_15",
                "travel_30",
                "travel_30p",
                name="travelfee",
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "service_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.String(length=32), nullable=False),
        sa.Column("service_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column(
            "type",
            sa.Enum("flat", "per_unit", "hourly", name="servicelinetype"),
            nullable=False,
        ),
        sa.Column("rate", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("base", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("per_unit", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("per_unit_label", sa.String(length=255), nullable=False),
        sa.Column("unit_label", sa.String(length=100), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("extra_qty", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_service_lines_id"), "service_lines", ["id"], unique=False
    )

    op.create_table(
        "hour_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.String(length=32), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("hours", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("rate", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hour_logs_id"), "hour_logs", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hour_logs_id"), table_name="hour_logs")
    op.drop_table("hour_logs")
    op.drop_index(op.f("ix_service_lines_id"), table_name="service_lines")
    op.drop_table("service_lines")
    op.drop_table("tickets")
    op.drop_index(
        op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens"
    )
    op.drop_index(op.f("ix_refresh_tokens_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")
    # Drop enums (PostgreSQL-specific)
    for enum_name in (
        "userrole", "ticketstatus", "ticketpriority",
        "clienttype", "travelfee", "servicelinetype",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
