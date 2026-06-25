"""Tests for SLA deadline computation on ticket create and priority change."""
import pytest
from datetime import datetime, timezone

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
    diff_resp = (response_due - created).total_seconds() / 3600
    diff_reso = (resolution_due - created).total_seconds() / 3600

    assert diff_resp == pytest.approx(resp_h, abs=0.1)
    assert diff_reso == pytest.approx(reso_h, abs=0.1)


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
