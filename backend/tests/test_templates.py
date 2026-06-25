import pytest

TEMPLATE_BASE = {
    "name": "Monthly Server Check",
    "ticket_type": "Incident",
    "client_type": "business",
    "priority": "High",
    "title": "Monthly server health check",
    "description": "Run the standard server health check procedure.",
    "internal_notes": "Check UPS and disk usage.",
    "travel_fee": "travel_none",
}


@pytest.fixture(scope="module")
def template_id(client, admin_headers):
    r = client.post("/api/templates", json=TEMPLATE_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_create_template(client, admin_headers):
    r = client.post("/api/templates", json=TEMPLATE_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Monthly Server Check"
    assert data["priority"] == "High"
    assert "id" in data
    assert "created_at" in data


def test_list_templates(client, admin_headers, template_id):
    r = client.get("/api/templates", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    ids = [t["id"] for t in data]
    assert template_id in ids


def test_list_templates_ordered_by_name(client, admin_headers):
    r = client.get("/api/templates", headers=admin_headers)
    names = [t["name"] for t in r.json()]
    assert names == sorted(names)


def test_update_template(client, admin_headers, template_id):
    updated = {**TEMPLATE_BASE, "name": "Updated Template", "priority": "Urgent"}
    r = client.put(f"/api/templates/{template_id}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Updated Template"
    assert data["priority"] == "Urgent"


def test_update_template_not_found(client, admin_headers):
    r = client.put("/api/templates/99999", json=TEMPLATE_BASE, headers=admin_headers)
    assert r.status_code == 404


def test_delete_template(client, admin_headers):
    r = client.post("/api/templates", json={**TEMPLATE_BASE, "name": "Delete Me"}, headers=admin_headers)
    tid = r.json()["id"]
    r = client.delete(f"/api/templates/{tid}", headers=admin_headers)
    assert r.status_code == 204
    ids = [t["id"] for t in client.get("/api/templates", headers=admin_headers).json()]
    assert tid not in ids


def test_delete_template_not_found(client, admin_headers):
    r = client.delete("/api/templates/99999", headers=admin_headers)
    assert r.status_code == 404


def test_technician_can_read_templates(client, tech_headers):
    r = client.get("/api/templates", headers=tech_headers)
    assert r.status_code == 200


def test_empty_name_rejected(client, admin_headers):
    r = client.post("/api/templates", json={**TEMPLATE_BASE, "name": ""}, headers=admin_headers)
    assert r.status_code == 422


def test_unauthenticated_cannot_list_templates(client):
    r = client.get("/api/templates")
    assert r.status_code in (401, 403)
