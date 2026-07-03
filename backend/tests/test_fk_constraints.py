"""Database-level foreign-key behaviour.

The shared test database (conftest) runs SQLite with foreign-key enforcement
OFF, which mirrors neither production (PostgreSQL) nor the intent of the schema.
These tests spin up an isolated SQLite engine with `PRAGMA foreign_keys=ON` so we
can assert the ON DELETE rules baked into the models actually fire — in particular
that deleting a client nulls the client_id on tickets and recurring tickets rather
than raising a foreign-key violation.
"""
import tempfile
from datetime import datetime

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.models import (
    User, UserRole, Client, ClientType, Ticket,
    RecurringTicket, RecurringInterval,
)


@pytest.fixture()
def fk_session():
    path = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _enable_fks(dbapi_conn, _rec):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    yield Session
    engine.dispose()


def _seed(Session):
    db = Session()
    u = User(email="fk@test.com", name="FK", password_hash="x", role=UserRole.admin)
    db.add(u); db.flush()
    c = Client(name="Acme", company="Acme", client_type=ClientType.business)
    db.add(c); db.flush()
    cid = c.id
    db.add(Ticket(id="TKT-FK-1", client_id=cid, created_by=u.id, client_name="Acme"))
    db.add(RecurringTicket(name="monthly", interval=RecurringInterval.monthly,
                           client_id=cid, next_run=datetime.now(), created_by=u.id))
    db.commit(); db.close()
    return cid


def test_raw_client_delete_nulls_ticket_fk(fk_session):
    """A raw SQL delete (bypassing ORM + app code) must succeed and null the FKs,
    proving the ON DELETE SET NULL rule is enforced by the database itself."""
    cid = _seed(fk_session)
    db = fk_session()
    db.execute(text("DELETE FROM clients WHERE id = :i"), {"i": cid})
    db.commit()
    db.close()

    db = fk_session()
    assert db.get(Ticket, "TKT-FK-1").client_id is None
    assert db.query(RecurringTicket).first().client_id is None
    db.close()


def test_ticket_snapshot_survives_client_delete(fk_session):
    """Nulling the FK must not wipe the denormalised client name snapshot."""
    cid = _seed(fk_session)
    db = fk_session()
    db.execute(text("DELETE FROM clients WHERE id = :i"), {"i": cid})
    db.commit()
    db.close()

    db = fk_session()
    assert db.get(Ticket, "TKT-FK-1").client_name == "Acme"
    db.close()
