"""Tests for backup/restore to NAS.

Router tests mock app.backup's functions directly (no real Postgres/NAS in
this test environment — tests run against SQLite per conftest.py). Module
tests exercise app.backup's own logic by mocking subprocess (pg_dump/pg_restore)
and smbclient (the network) independently.
"""
import time
from pathlib import Path

import pytest

from app import backup as backup_module
from app import config


# ─── Router: GET /backups (history) ──────────────────────────────────────────

def test_list_backup_runs_empty_shape(client, admin_headers):
    r = client.get("/api/backups", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data


def test_list_backup_runs_requires_admin(client, tech_headers):
    r = client.get("/api/backups", headers=tech_headers)
    assert r.status_code == 403


def test_backups_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_BACKUPS", False)
    try:
        assert client.get("/api/backups", headers=admin_headers).status_code == 503
        assert client.get("/api/backups/available", headers=admin_headers).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_BACKUPS", True)


# ─── Router: POST /backups/run (manual trigger) ──────────────────────────────

def test_trigger_backup_returns_202_and_creates_run(client, admin_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.backups.backup_module.run_backup",
        lambda: backup_module.BackupResult(success=True, filename="dispatch-backup-20260101-000000.tar.gz", size_bytes=1234),
    )
    r = client.post("/api/backups/run", headers=admin_headers)
    assert r.status_code == 202
    data = r.json()
    assert data["status"] == "running"
    assert data["triggered_by"] == "manual"

    # Background thread updates the row shortly after; poll briefly.
    run_id = data["id"]
    for _ in range(20):
        row = next((x for x in client.get("/api/backups", headers=admin_headers).json()["items"] if x["id"] == run_id), None)
        if row and row["status"] != "running":
            break
        time.sleep(0.05)
    assert row["status"] == "success"
    assert row["filename"] == "dispatch-backup-20260101-000000.tar.gz"
    assert row["size_bytes"] == 1234


def test_trigger_backup_requires_admin(client, tech_headers):
    r = client.post("/api/backups/run", headers=tech_headers)
    assert r.status_code == 403


def test_trigger_backup_records_failure(client, admin_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.backups.backup_module.run_backup",
        lambda: backup_module.BackupResult(success=False, error="NAS unreachable"),
    )
    r = client.post("/api/backups/run", headers=admin_headers)
    run_id = r.json()["id"]
    for _ in range(20):
        row = next((x for x in client.get("/api/backups", headers=admin_headers).json()["items"] if x["id"] == run_id), None)
        if row and row["status"] != "running":
            break
        time.sleep(0.05)
    assert row["status"] == "failed"
    assert row["error"] == "NAS unreachable"


# ─── Router: GET /backups/available ──────────────────────────────────────────

def test_list_available_backups(client, admin_headers, monkeypatch):
    from datetime import datetime, timezone
    monkeypatch.setattr(
        "app.routers.backups.backup_module.list_backups",
        lambda: [backup_module.BackupInfo(filename="dispatch-backup-20260101-000000.tar.gz", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc), size_bytes=5000)],
    )
    r = client.get("/api/backups/available", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["filename"] == "dispatch-backup-20260101-000000.tar.gz"


def test_list_available_backups_requires_admin(client, tech_headers):
    r = client.get("/api/backups/available", headers=tech_headers)
    assert r.status_code == 403


# ─── Router: POST /backups/restore ───────────────────────────────────────────

def test_restore_requires_correct_password(client, admin_headers, monkeypatch):
    monkeypatch.setattr("app.routers.backups.backup_module.restore_backup", lambda filename: None)
    monkeypatch.setattr("app.routers.backups.os._exit", lambda code: None)
    r = client.post(
        "/api/backups/restore",
        json={"filename": "dispatch-backup-20260101-000000.tar.gz", "password": "wrongpassword"},
        headers=admin_headers,
    )
    assert r.status_code == 401


def test_restore_succeeds_with_correct_password(client, admin_headers, monkeypatch):
    called = {}
    monkeypatch.setattr("app.routers.backups.backup_module.restore_backup", lambda filename: called.update(filename=filename))
    monkeypatch.setattr("app.routers.backups.os._exit", lambda code: None)
    r = client.post(
        "/api/backups/restore",
        json={"filename": "dispatch-backup-20260101-000000.tar.gz", "password": "adminpass"},
        headers=admin_headers,
    )
    assert r.status_code == 204
    time.sleep(1.2)  # the exit timer fires ~1s after the response
    assert called["filename"] == "dispatch-backup-20260101-000000.tar.gz"


def test_restore_requires_admin(client, tech_headers):
    r = client.post(
        "/api/backups/restore",
        json={"filename": "x.tar.gz", "password": "techpass"},
        headers=tech_headers,
    )
    assert r.status_code == 403


# ─── Module: app.backup (mocking subprocess + smbclient) ─────────────────────

def test_run_backup_skips_when_nas_not_configured(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_HOST", "")
    monkeypatch.setattr(config, "BACKUP_NAS_SHARE", "")
    result = backup_module.run_backup()
    assert result.success is False
    assert "not configured" in result.error


def test_run_backup_success(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "BACKUP_NAS_HOST", "nas.local")
    monkeypatch.setattr(config, "BACKUP_NAS_SHARE", "backups")
    monkeypatch.setattr(config, "UPLOAD_DIR", str(tmp_path))
    (tmp_path / "sample.txt").write_text("hello")

    def fake_dump(dest_path):
        Path(dest_path).write_bytes(b"fake-dump-bytes")

    uploaded = {}

    def fake_upload(local_path, filename):
        uploaded["filename"] = filename
        uploaded["size"] = Path(local_path).stat().st_size

    monkeypatch.setattr(backup_module, "_dump_database", fake_dump)
    monkeypatch.setattr(backup_module, "_upload_to_nas", fake_upload)
    monkeypatch.setattr(backup_module, "_apply_retention", lambda: None)

    result = backup_module.run_backup()
    assert result.success is True
    assert result.filename.startswith("dispatch-backup-")
    assert result.filename.endswith(".tar.gz")
    assert result.size_bytes > 0
    assert uploaded["filename"] == result.filename


def test_run_backup_failure_is_caught(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_HOST", "nas.local")
    monkeypatch.setattr(config, "BACKUP_NAS_SHARE", "backups")

    def boom(dest_path):
        raise RuntimeError("pg_dump exploded")

    monkeypatch.setattr(backup_module, "_dump_database", boom)
    result = backup_module.run_backup()
    assert result.success is False
    assert "pg_dump exploded" in result.error


def test_list_backups_empty_when_nas_not_configured(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_HOST", "")
    assert backup_module.list_backups() == []


def test_list_backups_parses_filenames(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_HOST", "nas.local")
    monkeypatch.setattr(config, "BACKUP_NAS_SHARE", "backups")
    monkeypatch.setattr(backup_module, "_register_session", lambda: None)
    monkeypatch.setattr(backup_module.smbclient, "listdir", lambda path: [
        "dispatch-backup-20260101-000000.tar.gz",
        "dispatch-backup-20260102-000000.tar.gz",
        "not-a-backup.txt",
    ])

    class FakeStat:
        st_size = 42

    monkeypatch.setattr(backup_module.smbclient, "stat", lambda path: FakeStat())

    infos = backup_module.list_backups()
    assert len(infos) == 2
    # newest first
    assert infos[0].filename == "dispatch-backup-20260102-000000.tar.gz"
    assert infos[0].size_bytes == 42


def test_db_connection_parts_parses_database_url(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql://dispatch:secret@postgres:5432/dispatch")
    parts = backup_module._db_connection_parts()
    assert parts == {"user": "dispatch", "password": "secret", "host": "postgres", "port": "5432", "dbname": "dispatch"}


def test_nas_username_includes_domain_when_set(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_USERNAME", "svc-backup")
    monkeypatch.setattr(config, "BACKUP_NAS_DOMAIN", "CORP")
    assert backup_module._nas_username() == "CORP\\svc-backup"


def test_nas_username_plain_when_no_domain(monkeypatch):
    monkeypatch.setattr(config, "BACKUP_NAS_USERNAME", "svc-backup")
    monkeypatch.setattr(config, "BACKUP_NAS_DOMAIN", "")
    assert backup_module._nas_username() == "svc-backup"
