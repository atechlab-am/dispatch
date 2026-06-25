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


def test_unauthenticated_cannot_list_clients(client):
    r = client.get("/api/clients")
    assert r.status_code in (401, 403)
