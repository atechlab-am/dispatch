"""add ticket_type column

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE tickettype AS ENUM ('Incident', 'Request', 'Change Request')")
    op.add_column(
        "tickets",
        sa.Column(
            "ticket_type",
            sa.Enum("Incident", "Request", "Change Request", name="tickettype"),
            nullable=False,
            server_default="Incident",
        ),
    )


def downgrade() -> None:
    op.drop_column("tickets", "ticket_type")
    op.execute("DROP TYPE tickettype")
