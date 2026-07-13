import pytest

CLIENT_BASE = {
    "name": "Fixture Corp",
    "email": "fixture@example.com",
    "phone": "514-555-0100",
    "address": "1 Test St, Montreal, QC",
    "client_type": "business",
    "company": "Fixture Corp Ltd",
    "notes": "Test client",
}


@pytest.fixture(scope="module")
def client_id(client, admin_headers):
    r = client.post("/api/clients", json=CLIENT_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_create_client(client, admin_headers):
    r = client.post("/api/clients", json=CLIENT_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Fixture Corp"
    assert data["client_type"] == "business"
    assert "id" in data


def test_list_clients(client, admin_headers):
    r = client.get("/api/clients", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_list_clients_search(client, admin_headers, client_id):
    r = client.get("/api/clients", params={"search": "Fixture"}, headers=admin_headers)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert client_id in ids


def test_get_client(client, admin_headers, client_id):
    r = client.get(f"/api/clients/{client_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "fixture@example.com"


def test_get_client_not_found(client, admin_headers):
    r = client.get("/api/clients/99999", headers=admin_headers)
    assert r.status_code == 404


def test_update_client(client, admin_headers, client_id):
    updated = {**CLIENT_BASE, "name": "Fixture Corp Updated", "notes": "updated"}
    r = client.put(f"/api/clients/{client_id}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Fixture Corp Updated"


def test_technician_can_read_clients(client, tech_headers):
    r = client.get("/api/clients", headers=tech_headers)
    assert r.status_code == 200


def test_delete_client(client, admin_headers):
    r = client.post("/api/clients", json={**CLIENT_BASE, "name": "Delete Me"}, headers=admin_headers)
    cid = r.json()["id"]
    r = client.delete(f"/api/clients/{cid}", headers=admin_headers)
    assert r.status_code == 204
    r = client.get(f"/api/clients/{cid}", headers=admin_headers)
    assert r.status_code == 404


def test_delete_client_with_ticket_nulls_reference(client, admin_headers):
    r = client.post("/api/clients", json={**CLIENT_BASE, "name": "Has Ticket"}, headers=admin_headers)
    cid = r.json()["id"]
    r = client.post("/api/tickets", json={"status": "Open", "priority": "Low",
        "client_type": "business", "client_id": cid, "client_name": "Has Ticket",
        "client_email": "", "client_phone": "", "client_address": "", "title": "T",
        "description": "", "internal_notes": "", "travel_fee": "travel_none",
        "service_lines": [], "hour_logs": []}, headers=admin_headers)
    tid = r.json()["id"]
    r = client.delete(f"/api/clients/{cid}", headers=admin_headers)
    assert r.status_code == 204
    # Ticket survives with its client reference nulled
    t = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    assert t["client_id"] is None
    assert t["client_name"] == "Has Ticket"   # snapshot preserved


def test_delete_client_with_recurring_ticket(client, admin_headers):
    r = client.post("/api/clients", json={**CLIENT_BASE, "name": "Has Recurring"}, headers=admin_headers)
    cid = r.json()["id"]
    rr = client.post("/api/recurring", json={"name": "Monthly check", "interval": "monthly",
        "ticket_type": "Incident", "client_type": "business", "priority": "Medium",
        "client_id": cid, "title": "Monthly", "description": "", "active": True}, headers=admin_headers)
    assert rr.status_code == 201
    # Must not raise an FK error
    r = client.delete(f"/api/clients/{cid}", headers=admin_headers)
    assert r.status_code == 204


def test_unauthenticated_cannot_list_clients(client):
    r = client.get("/api/clients")
    assert r.status_code in (401, 403)


def test_company_summary_aggregates_across_contacts(client, admin_headers):
    company = "Summary Aggregation Co"
    r = client.post("/api/clients", json={**CLIENT_BASE, "name": "Primary Contact", "company": company}, headers=admin_headers)
    primary_id = r.json()["id"]
    r = client.post("/api/clients", json={**CLIENT_BASE, "name": "Second Contact", "company": company}, headers=admin_headers)
    second_id = r.json()["id"]

    # A ticket against the *second* contact, not the primary — must still be counted.
    r = client.post("/api/tickets", json={"status": "Open", "priority": "Low",
        "client_type": "business", "client_id": second_id, "client_name": "Second Contact",
        "client_email": "", "client_phone": "", "client_address": "", "title": "Ticket via second contact",
        "description": "", "internal_notes": "", "travel_fee": "travel_none",
        "service_lines": [], "hour_logs": []}, headers=admin_headers)
    assert r.status_code == 201

    # A closed ticket against the primary contact.
    r = client.post("/api/tickets", json={"status": "Closed", "priority": "Low",
        "client_type": "business", "client_id": primary_id, "client_name": "Primary Contact",
        "client_email": "", "client_phone": "", "client_address": "", "title": "Closed ticket",
        "description": "", "internal_notes": "", "travel_fee": "travel_none",
        "service_lines": [], "hour_logs": []}, headers=admin_headers)
    assert r.status_code == 201

    # An invoice against the primary contact.
    r = client.post("/api/invoices", json={
        "client_id": primary_id, "client_name": "Primary Contact", "client_email": "",
        "client_address": "", "status": "Sent", "issue_date": "2026-06-01", "due_date": "2026-06-30",
        "notes": "", "tax_rate": 0, "lines": [{"description": "Work", "qty": 1, "unit_price": 200, "amount": 200}],
    }, headers=admin_headers)
    assert r.status_code == 201

    r = client.get("/api/clients/company-summary", params={"company": company}, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["ticket_count"] == 2
    assert data["open_ticket_count"] == 1
    assert data["invoice_count"] == 1
    assert data["total_billed"] == 200
    assert data["outstanding"] == 200


def test_company_summary_unknown_company_returns_zeros(client, admin_headers):
    r = client.get("/api/clients/company-summary", params={"company": "Nonexistent Co"}, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["ticket_count"] == 0
    assert data["invoice_count"] == 0
