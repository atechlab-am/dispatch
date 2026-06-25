"""Tests for ticket assignment and assignee filter."""
import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "High",
    "client_type": "business",
    "client_name": "Assign Corp",
    "client_email": "assign@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Assigned ticket test",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}


@pytest.fixture(scope="module")
def tech_user_id(client, admin_headers):
    """Get the ID of the seeded technician user."""
    r = client.get("/api/users", headers=admin_headers)
    for u in r.json():
        if u["email"] == "tech@test.com":
            return u["id"]
    pytest.fail("tech@test.com not found")


def test_create_ticket_with_assignee(client, admin_headers, tech_user_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_user_id}, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["assigned_to"] == tech_user_id


def test_create_ticket_unassigned(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["assigned_to"] is None


def test_update_ticket_assign(client, admin_headers, tech_user_id):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    tid = r.json()["id"]
    updated = {**TICKET_BASE, "assigned_to": tech_user_id}
    r = client.put(f"/api/tickets/{tid}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["assigned_to"] == tech_user_id


def test_update_ticket_unassign(client, admin_headers, tech_user_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_user_id}, headers=admin_headers)
    tid = r.json()["id"]
    updated = {**TICKET_BASE, "assigned_to": None}
    r = client.put(f"/api/tickets/{tid}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["assigned_to"] is None


def test_list_tickets_filter_by_assignee(client, admin_headers, tech_user_id):
    # Create one assigned and one unassigned ticket
    r1 = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_user_id, "title": "Assigned A"}, headers=admin_headers)
    tid = r1.json()["id"]
    client.post("/api/tickets", json={**TICKET_BASE, "title": "Unassigned B"}, headers=admin_headers)

    r = client.get("/api/tickets", params={"assigned_to": tech_user_id}, headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(t["assigned_to"] == tech_user_id for t in items)
    assert any(t["id"] == tid for t in items)


def test_assigned_to_in_list_item(client, admin_headers, tech_user_id):
    r = client.get("/api/tickets", headers=admin_headers)
    for t in r.json()["items"]:
        assert "assigned_to" in t
