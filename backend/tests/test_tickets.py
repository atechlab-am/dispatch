import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "High",
    "client_type": "business",
    "client_name": "Acme Corp",
    "client_email": "acme@example.com",
    "client_phone": "514-000-0000",
    "client_address": "123 Main St",
    "title": "Server down",
    "description": "The main server is unresponsive.",
    "internal_notes": "Check UPS first",
    "travel_fee": "travel_15",
    "service_lines": [
        {
            "service_id": "server_health",
            "name": "Server Health Check",
            "type": "per_unit",
            "rate": 300,
            "base": 0,
            "per_unit": 0,
            "per_unit_label": "",
            "unit_label": "server",
            "qty": 2,
            "extra_qty": 0,
        }
    ],
    "hour_logs": [
        {"date": "2026-06-01", "hours": 1.5, "rate": 130, "description": "On-site diagnosis"}
    ],
}


@pytest.fixture(scope="module")
def ticket_id(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_create_ticket(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("TKT-")
    assert data["title"] == "Server down"
    assert len(data["service_lines"]) == 1
    assert len(data["hour_logs"]) == 1


def test_ticket_id_format(ticket_id):
    parts = ticket_id.split("-")
    assert parts[0] == "TKT"
    assert len(parts[1]) == 4   # year
    assert len(parts[2]) == 5   # zero-padded sequence


def test_get_ticket(client, admin_headers, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["client_name"] == "Acme Corp"
    assert data["service_lines"][0]["qty"] == 2
    assert float(data["hour_logs"][0]["hours"]) == 1.5


def test_get_ticket_not_found(client, admin_headers):
    r = client.get("/api/tickets/TKT-0000-00000", headers=admin_headers)
    assert r.status_code == 404


def test_list_tickets(client, admin_headers):
    r = client.get("/api/tickets", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] >= 1


def test_list_tickets_search(client, admin_headers, ticket_id):
    r = client.get("/api/tickets", params={"search": "Acme"}, headers=admin_headers)
    assert r.status_code == 200
    ids = [t["id"] for t in r.json()["items"]]
    assert ticket_id in ids


def test_list_tickets_status_filter(client, admin_headers, ticket_id):
    r = client.get("/api/tickets", params={"status": "Open"}, headers=admin_headers)
    assert r.status_code == 200
    for t in r.json()["items"]:
        assert t["status"] == "Open"


def test_update_ticket(client, admin_headers, ticket_id):
    updated = {**TICKET_BASE, "status": "In Progress", "title": "Server down — updated", "service_lines": [], "hour_logs": []}
    r = client.put(f"/api/tickets/{ticket_id}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "In Progress"
    assert data["title"] == "Server down — updated"
    assert data["service_lines"] == []
    assert data["hour_logs"] == []


def test_delete_ticket(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    tid = r.json()["id"]

    r = client.delete(f"/api/tickets/{tid}", headers=admin_headers)
    assert r.status_code == 204

    r = client.get(f"/api/tickets/{tid}", headers=admin_headers)
    assert r.status_code == 404


def test_technician_can_create_ticket(client, tech_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=tech_headers)
    assert r.status_code == 201


def test_unauthenticated_cannot_list(client):
    r = client.get("/api/tickets")
    assert r.status_code in (401, 403)


def test_has_appointment_filter(client, admin_headers, tech_headers):
    r = client.post("/api/tickets", json={**TICKET_BASE, "title": "Scheduled ticket"}, headers=admin_headers)
    scheduled_id = r.json()["id"]
    r2 = client.post("/api/tickets", json={**TICKET_BASE, "title": "Unscheduled ticket"}, headers=admin_headers)
    unscheduled_id = r2.json()["id"]

    tech_id = client.get("/api/auth/me", headers=tech_headers).json()["id"]
    client.post("/api/appointments", json={
        "ticket_id": scheduled_id, "technician_id": tech_id,
        "start_at": "2026-08-10T09:00:00Z", "end_at": "2026-08-10T10:00:00Z",
    }, headers=admin_headers)

    r_unsched = client.get("/api/tickets", params={"has_appointment": "false", "page_size": 100}, headers=admin_headers)
    unsched_ids = {t["id"] for t in r_unsched.json()["items"]}
    assert unscheduled_id in unsched_ids
    assert scheduled_id not in unsched_ids

    r_sched = client.get("/api/tickets", params={"has_appointment": "true", "page_size": 100}, headers=admin_headers)
    sched_ids = {t["id"] for t in r_sched.json()["items"]}
    assert scheduled_id in sched_ids
    assert unscheduled_id not in sched_ids
