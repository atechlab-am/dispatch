"""Tests for SLA deadline computation on ticket create and priority change."""
import pytest
from datetime import datetime, timezone, timedelta

from app.routers.tickets import _add_business_hours, _sla_deadlines

TICKET_BASE = {
    "status": "Open",
    "client_type": "business",
    "client_name": "SLA Corp",
    "client_email": "sla@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "SLA test ticket",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}

SLA_HOURS = {
    "Urgent": (1, 4),
    "High":   (4, 8),
    "Medium": (8, 24),
    "Low":    (24, 72),
}


# ── Unit tests for business-hours helper ─────────────────────────────────────

def test_add_business_hours_midweek():
    # Wednesday 10:00 + 4h = Wednesday 14:00 (no weekend involved)
    start = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)  # Wednesday
    result = _add_business_hours(start, 4)
    assert result == datetime(2026, 7, 1, 14, 0, tzinfo=timezone.utc)


def test_add_business_hours_skips_weekend():
    # Friday 22:00 + 4h: 2h takes us to Saturday 00:00, remaining 2h resumes Monday 02:00
    start = datetime(2026, 7, 3, 22, 0, tzinfo=timezone.utc)  # Friday
    result = _add_business_hours(start, 4)
    assert result == datetime(2026, 7, 6, 2, 0, tzinfo=timezone.utc)  # Monday


def test_add_business_hours_starts_on_saturday():
    # Saturday 12:00 — should jump to Monday 00:00 before counting hours
    start = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)  # Saturday
    result = _add_business_hours(start, 8)
    assert result == datetime(2026, 7, 6, 8, 0, tzinfo=timezone.utc)  # Monday 08:00


def test_add_business_hours_starts_on_sunday():
    start = datetime(2026, 7, 5, 6, 0, tzinfo=timezone.utc)  # Sunday
    result = _add_business_hours(start, 1)
    assert result == datetime(2026, 7, 6, 1, 0, tzinfo=timezone.utc)  # Monday 01:00


def test_add_business_hours_spans_multiple_weekends():
    # Monday 00:00 + 72h business hours = Thursday 00:00 (3 full weekdays)
    start = datetime(2026, 7, 6, 0, 0, tzinfo=timezone.utc)  # Monday
    result = _add_business_hours(start, 72)
    assert result == datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc)  # Thursday


def test_sla_urgent_ignores_weekend():
    # Urgent always uses wall-clock time
    # Friday 23:00 + 1h response = Saturday 00:00
    start = datetime(2026, 7, 3, 23, 0, tzinfo=timezone.utc)  # Friday
    response_due, resolution_due = _sla_deadlines("Urgent", start)
    assert response_due == start + timedelta(hours=1)
    assert resolution_due == start + timedelta(hours=4)


def test_sla_high_skips_weekend():
    # Friday 22:00, High = 4h response, 8h resolution
    # 4h response: 2h to Saturday + 2h Monday = Monday 02:00
    # 8h resolution: 2h to Saturday + 6h Monday = Monday 06:00
    start = datetime(2026, 7, 3, 22, 0, tzinfo=timezone.utc)  # Friday
    response_due, resolution_due = _sla_deadlines("High", start)
    assert response_due == datetime(2026, 7, 6, 2, 0, tzinfo=timezone.utc)
    assert resolution_due == datetime(2026, 7, 6, 6, 0, tzinfo=timezone.utc)


def test_sla_low_skips_weekend():
    # Monday 00:00, Low = 24h response, 72h resolution — all business days
    start = datetime(2026, 7, 6, 0, 0, tzinfo=timezone.utc)  # Monday
    response_due, resolution_due = _sla_deadlines("Low", start)
    assert response_due == datetime(2026, 7, 7, 0, 0, tzinfo=timezone.utc)   # Tuesday
    assert resolution_due == datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc)  # Thursday


# ── Integration tests (HTTP) ──────────────────────────────────────────────────

@pytest.mark.parametrize("priority", ["Urgent", "High", "Medium", "Low"])
def test_sla_deadlines_set_on_create(client, admin_headers, priority):
    r = client.post("/api/tickets", json={**TICKET_BASE, "priority": priority}, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["sla_response_due"] is not None
    assert data["sla_resolution_due"] is not None

    created = datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
    response_due = datetime.fromisoformat(data["sla_response_due"].replace("Z", "+00:00"))
    resolution_due = datetime.fromisoformat(data["sla_resolution_due"].replace("Z", "+00:00"))

    resp_h, reso_h = SLA_HOURS[priority]
    # Deadlines must be at least the nominal hours away (could be more if weekend skipped)
    assert (response_due - created).total_seconds() / 3600 >= resp_h - 0.01
    assert (resolution_due - created).total_seconds() / 3600 >= reso_h - 0.01

    # Urgent must be exactly wall-clock hours
    if priority == "Urgent":
        assert (response_due - created).total_seconds() / 3600 == pytest.approx(resp_h, abs=0.01)
        assert (resolution_due - created).total_seconds() / 3600 == pytest.approx(reso_h, abs=0.01)


def test_sla_recalculated_on_priority_change(client, admin_headers):
    r = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Low"}, headers=admin_headers)
    tid = r.json()["id"]
    old_resolution = r.json()["sla_resolution_due"]

    updated = {**TICKET_BASE, "priority": "Urgent"}
    r2 = client.put(f"/api/tickets/{tid}", json=updated, headers=admin_headers)
    assert r2.status_code == 200
    new_resolution = r2.json()["sla_resolution_due"]

    assert new_resolution != old_resolution

    created = datetime.fromisoformat(r.json()["created_at"].replace("Z", "+00:00"))
    resolution_due = datetime.fromisoformat(new_resolution.replace("Z", "+00:00"))
    diff_reso = (resolution_due - created).total_seconds() / 3600
    assert diff_reso == pytest.approx(4, abs=0.1)


def test_sla_not_recalculated_when_priority_unchanged(client, admin_headers):
    r = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Medium"}, headers=admin_headers)
    tid = r.json()["id"]
    original_due = r.json()["sla_resolution_due"]

    updated = {**TICKET_BASE, "priority": "Medium", "title": "Updated title"}
    r2 = client.put(f"/api/tickets/{tid}", json=updated, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["sla_resolution_due"] == original_due


def test_sla_fields_in_list_item(client, admin_headers):
    r = client.get("/api/tickets", headers=admin_headers)
    for t in r.json()["items"]:
        assert "sla_response_due" in t
        assert "sla_resolution_due" in t
