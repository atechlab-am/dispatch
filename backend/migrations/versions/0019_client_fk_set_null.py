"""Add ON DELETE SET NULL to client_id FKs on tickets and recurring_tickets

Previously these foreign keys had no ondelete rule (NO ACTION), so deleting a
client that still had tickets or recurring schedules failed with a foreign-key
violation in PostgreSQL. This makes the database null the reference automatically,
matching the model definitions.

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

_TABLES = ["tickets", "recurring_tickets"]


def _pg_existing_client_fks(table: str) -> list[str]:
    """Return the names of every FK currently constraining <table>.client_id."""
    conn = op.get_bind()
    rows = conn.execute(sa.text("""
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = :t
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'client_id'
    """), {"t": table}).fetchall()
    return [r[0] for r in rows]


def _recreate(ondelete):
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in _TABLES:
            # Drop the real FK(s) by their actual names — don't guess.
            for cname in _pg_existing_client_fks(table):
                op.execute(f'ALTER TABLE {table} DROP CONSTRAINT "{cname}"')
            op.create_foreign_key(
                f"{table}_client_id_fkey", table, "clients",
                ["client_id"], ["id"], ondelete=ondelete,
            )
    else:
        # SQLite can't alter constraints in place — rebuild via batch mode.
        for table in _TABLES:
            with op.batch_alter_table(table) as batch:
                batch.create_foreign_key(
                    f"{table}_client_id_fkey", "clients",
                    ["client_id"], ["id"], ondelete=ondelete,
                )


def upgrade():
    _recreate("SET NULL")


def downgrade():
    _recreate(None)
