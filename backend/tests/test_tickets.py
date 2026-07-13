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


def test_list_tickets_active_status_filter_excludes_on_hold_resolved_closed(client, admin_headers):
    r = client.post("/api/tickets", json={**TICKET_BASE, "status": "On Hold", "title": "On hold ticket"}, headers=admin_headers)
    on_hold_id = r.json()["id"]
    r = client.post("/api/tickets", json={**TICKET_BASE, "status": "Resolved", "title": "Resolved ticket"}, headers=admin_headers)
    resolved_id = r.json()["id"]
    r = client.post("/api/tickets", json={**TICKET_BASE, "status": "Awaiting Client", "title": "Awaiting client ticket"}, headers=admin_headers)
    awaiting_id = r.json()["id"]

    r = client.get("/api/tickets", params={"status": "Active", "page_size": 100}, headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    ids = [t["id"] for t in items]
    statuses = {t["status"] for t in items}

    assert awaiting_id in ids
    assert on_hold_id not in ids
    assert resolved_id not in ids
    assert statuses <= {"Open", "In Progress", "Awaiting Client"}


def test_update_ticket(client, admin_headers, ticket_id):
    updated = {**TICKET_BASE, "status": "In Progress", "title": "Server down — updated", "service_lines": [], "hour_logs": []}
    r = client.put(f"/api/tickets/{ticket_id}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "In Progress"
    assert data["title"] == "Server down — updated"
    assert data["service_lines"] == []
    assert data["hour_logs"] == []


# ─── Materials used ─────────────────────────────────────────────────────────────

def test_create_ticket_with_materials_used(client, admin_headers):
    payload = {**TICKET_BASE, "materials_used": [
        {"material_id": None, "name": "Cat6 Cable", "unit_price": 25.0, "qty": 2},
    ]}
    r = client.post("/api/tickets", json=payload, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert len(data["materials_used"]) == 1
    assert data["materials_used"][0]["name"] == "Cat6 Cable"
    assert data["materials_used"][0]["qty"] == 2
    assert data["materials_used"][0]["unit_price"] == 25.0


def test_update_ticket_replaces_materials_used(client, admin_headers):
    payload = {**TICKET_BASE, "materials_used": [
        {"material_id": None, "name": "Cat6 Cable", "unit_price": 25.0, "qty": 2},
    ]}
    tid = client.post("/api/tickets", json=payload, headers=admin_headers).json()["id"]

    updated = {**TICKET_BASE, "materials_used": [
        {"material_id": None, "name": "RJ45 Connector", "unit_price": 1.5, "qty": 10},
    ]}
    r = client.put(f"/api/tickets/{tid}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["materials_used"]) == 1
    assert data["materials_used"][0]["name"] == "RJ45 Connector"
    assert data["materials_used"][0]["qty"] == 10


def test_ticket_export_includes_materials_total(client, admin_headers):
    payload = {**TICKET_BASE, "title": "Materials Export Test", "service_lines": [], "hour_logs": [], "materials_used": [
        {"material_id": None, "name": "Switch", "unit_price": 50.0, "qty": 2},
    ]}
    client.post("/api/tickets", json=payload, headers=admin_headers)
    r = client.get("/api/tickets/export", headers=admin_headers)
    assert r.status_code == 200
    body = r.text
    assert "Materials Total" in body
    assert "Materials Export Test" in body


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
