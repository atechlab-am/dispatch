import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Timer Client",
    "client_email": "timer@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for timer",
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


def test_start_timer(client, admin_headers, ticket_id):
    r = client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["is_running"] is True
    assert data["started_at"] is not None
    assert data["rate"] == 110  # business default


def test_starting_second_timer_conflicts(client, admin_headers, ticket_id):
    client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    assert r.status_code == 409


def test_stop_timer(client, admin_headers, ticket_id):
    client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/timer/stop", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["is_running"] is False
    assert data["ended_at"] is not None
    assert data["hours"] >= 0


def test_stop_timer_with_none_running(client, admin_headers, ticket_id):
    r = client.post(f"/api/tickets/{ticket_id}/timer/stop", headers=admin_headers)
    assert r.status_code == 404


def test_get_active_timer_when_none_running(client, admin_headers, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/timer/active", headers=admin_headers)
    assert r.status_code == 200
    assert r.json() is None


def test_get_active_timer_when_running(client, admin_headers, ticket_id):
    client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    r = client.get(f"/api/tickets/{ticket_id}/timer/active", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["is_running"] is True


def test_running_timer_survives_ticket_autosave(client, admin_headers, ticket_id):
    """Regression test: a full ticket PUT (simulating the editor's autosave) must
    not delete a running timer's HourLog row, even though the PUT payload has no
    knowledge of it."""
    client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)

    # Simulate autosave: full ticket payload with different (or no) manual hour_logs.
    body = {**TICKET_BASE, "hour_logs": [{"date": "2026-07-03", "hours": 1, "rate": 100, "description": "Manual"}]}
    r = client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)
    assert r.status_code == 200

    active = client.get(f"/api/tickets/{ticket_id}/timer/active", headers=admin_headers).json()
    assert active is not None
    assert active["is_running"] is True

    ticket = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers).json()
    # Both the manual row and the still-running timer row must be present.
    assert len(ticket["hour_logs"]) == 2


def test_running_timer_contributes_zero_to_total_until_stopped(client, admin_headers, ticket_id):
    client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers)
    ticket = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers).json()
    running = next(h for h in ticket["hour_logs"] if h["is_running"])
    assert float(running["hours"]) == 0
