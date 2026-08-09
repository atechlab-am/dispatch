"""Tests for recurring ticket schedules."""
import pytest
from datetime import datetime, timezone

RECURRING_BASE = {
    "name": "Monthly Backup Check",
    "interval": "monthly",
    "ticket_type": "Incident",
    "client_type": "business",
    "priority": "Low",
    "title": "Monthly backup verification",
    "description": "Check backup integrity",
    "active": True,
}


def test_create_recurring(client, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json=RECURRING_BASE)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Monthly Backup Check"
    assert data["interval"] == "monthly"
    assert data["active"] is True
    assert "next_run" in data
    assert "id" in data


def test_list_recurring(client, admin_headers):
    r = client.get("/api/recurring", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert items[0]["name"] == "Monthly Backup Check"


def test_get_recurring(client, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json={**RECURRING_BASE, "name": "Weekly Patch"})
    assert r.status_code == 201
    rid = r.json()["id"]

    r2 = client.get(f"/api/recurring/{rid}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["name"] == "Weekly Patch"


def test_update_recurring(client, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json={**RECURRING_BASE, "name": "To Update"})
    rid = r.json()["id"]

    r2 = client.put(f"/api/recurring/{rid}", headers=admin_headers, json={
        **RECURRING_BASE, "name": "Updated Name", "interval": "weekly",
    })
    assert r2.status_code == 200
    assert r2.json()["name"] == "Updated Name"
    assert r2.json()["interval"] == "weekly"


def test_delete_recurring(client, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json={**RECURRING_BASE, "name": "To Delete"})
    rid = r.json()["id"]

    r2 = client.delete(f"/api/recurring/{rid}", headers=admin_headers)
    assert r2.status_code == 204

    r3 = client.get(f"/api/recurring/{rid}", headers=admin_headers)
    assert r3.status_code == 404


def test_technician_cannot_delete_recurring(client, tech_headers, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json={**RECURRING_BASE, "name": "Tech Cannot Delete"})
    rid = r.json()["id"]

    r2 = client.delete(f"/api/recurring/{rid}", headers=tech_headers)
    assert r2.status_code == 403


def test_all_intervals_accepted(client, admin_headers):
    for interval in ("daily", "weekly", "monthly", "quarterly"):
        r = client.post("/api/recurring", headers=admin_headers, json={
            **RECURRING_BASE, "name": f"Test {interval}", "interval": interval,
        })
        assert r.status_code == 201, f"Failed for interval={interval}: {r.text}"


def test_invalid_interval_rejected(client, admin_headers):
    r = client.post("/api/recurring", headers=admin_headers, json={
        **RECURRING_BASE, "name": "Bad", "interval": "biennially",
    })
    assert r.status_code == 422


def test_unauthenticated_cannot_list(client):
    r = client.get("/api/recurring")
    assert r.status_code in (401, 403)


def test_next_run_after_helper():
    from app.tasks import next_run_after
    base = datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc)

    assert next_run_after("daily", base).day == 1
    assert next_run_after("weekly", base).day == 7
    monthly = next_run_after("monthly", base)
    assert monthly.month == 2 and monthly.day == 28  # Feb has no 31st
    quarterly = next_run_after("quarterly", base)
    assert quarterly.month == 4 and quarterly.day == 30  # Apr has no 31st
