import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Audit Client",
    "client_email": "audit@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for audit",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}


@pytest.fixture()
def ticket_id(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_create_ticket_writes_created_entry(client, admin_headers, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers)
    assert r.status_code == 200
    entries = r.json()
    assert any(e["action"] == "created" for e in entries)
    created = next(e for e in entries if e["action"] == "created")
    assert created["actor_label"] == "Test Admin"


def test_status_change_writes_status_changed_entry(client, admin_headers, ticket_id):
    body = {**TICKET_BASE, "status": "In Progress"}
    r = client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)
    assert r.status_code == 200

    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers)
    entries = r.json()
    status_entries = [e for e in entries if e["action"] == "status_changed"]
    assert len(status_entries) == 1
    assert status_entries[0]["old_value"] == "Open"
    assert status_entries[0]["new_value"] == "In Progress"


def test_assignee_only_change_writes_assignee_changed_not_field_changed(client, admin_headers, tech_headers, ticket_id):
    # Get the tech user's id via /api/auth/me
    me = client.get("/api/auth/me", headers=tech_headers).json()
    body = {**TICKET_BASE, "status": "In Progress", "assigned_to": me["id"]}
    r = client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)
    assert r.status_code == 200

    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers)
    entries = r.json()
    assignee_entries = [e for e in entries if e["action"] == "assignee_changed"]
    assert len(assignee_entries) == 1
    assert assignee_entries[0]["new_value"] == str(me["id"])
    # assigned_to must never show up as a generic field_changed entry
    assert not any(e["action"] == "field_changed" and e["field"] == "assigned_to" for e in entries)


def test_price_affecting_change_writes_price_changed_entry(client, admin_headers, ticket_id):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    body = {
        **TICKET_BASE,
        "status": "In Progress",
        "assigned_to": None,
        "hour_logs": [{"date": "2026-07-03", "hours": 2, "rate": 100, "description": "Work"}],
    }
    r = client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)
    assert r.status_code == 200

    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers)
    entries = r.json()
    assert any(e["action"] == "price_changed" for e in entries)


def test_no_write_endpoints_on_audit_log(client, admin_headers, ticket_id):
    r = client.put(f"/api/tickets/{ticket_id}/audit", json={}, headers=admin_headers)
    assert r.status_code in (404, 405)
    r = client.delete(f"/api/tickets/{ticket_id}/audit/1", headers=admin_headers)
    assert r.status_code in (404, 405)


def test_technician_can_view_audit_trail(client, tech_headers, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=tech_headers)
    assert r.status_code == 200


def test_audit_on_missing_ticket(client, admin_headers):
    r = client.get("/api/tickets/TKT-0000-00000/audit", headers=admin_headers)
    assert r.status_code == 404


def test_unauthenticated_cannot_view_audit(client, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/audit")
    assert r.status_code in (401, 403)
