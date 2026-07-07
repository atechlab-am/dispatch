"""Tests for the scheduling/dispatch calendar (appointments)."""
import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Schedule Client",
    "client_email": "schedule@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for scheduling",
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


@pytest.fixture()
def tech_id(client, tech_headers):
    return client.get("/api/auth/me", headers=tech_headers).json()["id"]


def test_create_appointment(client, admin_headers, ticket_id, tech_id):
    r = client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-01T09:00:00Z", "end_at": "2026-08-01T10:00:00Z", "notes": "Initial visit",
    }, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["ticket_id"] == ticket_id
    assert data["technician_id"] == tech_id
    assert data["ticket_title"] == "Ticket for scheduling"
    assert data["technician_name"] == "Test Tech"


def test_create_appointment_rejects_end_before_start(client, admin_headers, ticket_id, tech_id):
    r = client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-01T10:00:00Z", "end_at": "2026-08-01T09:00:00Z",
    }, headers=admin_headers)
    assert r.status_code == 400


def test_create_appointment_missing_ticket_404s(client, admin_headers, tech_id):
    r = client.post("/api/appointments", json={
        "ticket_id": "TKT-0000-00000", "technician_id": tech_id,
        "start_at": "2026-08-01T09:00:00Z", "end_at": "2026-08-01T10:00:00Z",
    }, headers=admin_headers)
    assert r.status_code == 404


def test_create_appointment_notifies_technician(client, admin_headers, tech_headers, ticket_id, tech_id):
    client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-02T09:00:00Z", "end_at": "2026-08-02T10:00:00Z",
    }, headers=admin_headers)

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "appointment_scheduled" and n["ticket_id"] == ticket_id for n in notes)


def test_create_appointment_writes_audit_log(client, admin_headers, ticket_id, tech_id):
    client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-03T09:00:00Z", "end_at": "2026-08-03T10:00:00Z",
    }, headers=admin_headers)

    audit = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers).json()
    assert any(a["action"] == "appointment_scheduled" for a in audit)


def test_list_appointments_filters_by_range(client, admin_headers, ticket_id, tech_id):
    client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-09-01T09:00:00Z", "end_at": "2026-09-01T10:00:00Z",
    }, headers=admin_headers)

    r_in = client.get("/api/appointments", params={"start": "2026-09-01T00:00:00Z", "end": "2026-09-02T00:00:00Z"}, headers=admin_headers)
    assert r_in.status_code == 200
    assert any(a["ticket_id"] == ticket_id for a in r_in.json())

    r_out = client.get("/api/appointments", params={"start": "2026-10-01T00:00:00Z", "end": "2026-10-02T00:00:00Z"}, headers=admin_headers)
    assert not any(a["ticket_id"] == ticket_id and a["start_at"].startswith("2026-09") for a in r_out.json())


def test_reschedule_appointment_writes_audit_with_old_new_values(client, admin_headers, ticket_id, tech_id):
    r = client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-04T09:00:00Z", "end_at": "2026-08-04T10:00:00Z",
    }, headers=admin_headers)
    aid = r.json()["id"]

    r2 = client.put(f"/api/appointments/{aid}", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-05T14:00:00Z", "end_at": "2026-08-05T15:00:00Z",
    }, headers=admin_headers)
    assert r2.status_code == 200

    audit = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers).json()
    rescheduled = [a for a in audit if a["action"] == "appointment_rescheduled"]
    assert len(rescheduled) == 1
    assert "2026-08-04" in rescheduled[0]["old_value"]
    assert "2026-08-05" in rescheduled[0]["new_value"]


def test_delete_appointment_writes_audit(client, admin_headers, ticket_id, tech_id):
    r = client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-06T09:00:00Z", "end_at": "2026-08-06T10:00:00Z",
    }, headers=admin_headers)
    aid = r.json()["id"]

    r2 = client.delete(f"/api/appointments/{aid}", headers=admin_headers)
    assert r2.status_code == 204

    audit = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers).json()
    assert any(a["action"] == "appointment_cancelled" for a in audit)


def test_unauthenticated_cannot_list_appointments(client):
    r = client.get("/api/appointments", params={"start": "2026-01-01T00:00:00Z", "end": "2026-01-02T00:00:00Z"})
    assert r.status_code in (401, 403)
