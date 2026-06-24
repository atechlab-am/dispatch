import os
import tempfile

# Must be set before any app module is imported
_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db_file.close()
TEST_DB_PATH = _db_file.name
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"

os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["FIRST_ADMIN_EMAIL"] = "seeded_admin@test.com"
os.environ["FIRST_ADMIN_PASSWORD"] = ""   # disable auto-seed; we seed manually
os.environ["FIRST_ADMIN_NAME"] = "Seeded"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Patch the module-level engine before main.py imports it so lifespan uses the test DB
import app.database as _db_module

TEST_ENGINE = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
_db_module.engine = TEST_ENGINE
_db_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)

from app.database import Base, get_db
from app.main import app
from app.models.models import User, UserRole
from app.security import hash_password


def override_get_db():
    db = _db_module.SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = _db_module.SessionLocal()
    db.add(User(
        email="admin@test.com",
        name="Test Admin",
        password_hash=hash_password("adminpass"),
        role=UserRole.admin,
    ))
    db.add(User(
        email="tech@test.com",
        name="Test Tech",
        password_hash=hash_password("techpass"),
        role=UserRole.technician,
    ))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)
    os.unlink(TEST_DB_PATH)


@pytest.fixture(scope="session")
def client(setup_db):
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def admin_headers(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "adminpass"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def tech_headers(client):
    r = client.post("/api/auth/login", json={"email": "tech@test.com", "password": "techpass"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
