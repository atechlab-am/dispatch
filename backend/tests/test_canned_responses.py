"""Tests for canned responses (admin-managed comment snippet library)."""
from app import config

RESPONSE_BASE = {"name": "Password Reset", "body": "We've reset your password; check your email."}


def test_admin_can_create_canned_response(client, admin_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Password Reset"
    assert data["body"].startswith("We've reset")


def test_technician_cannot_create_canned_response(client, tech_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=tech_headers)
    assert r.status_code == 403


def test_technician_can_list_canned_responses(client, admin_headers, tech_headers):
    client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    r = client.get("/api/canned-responses", headers=tech_headers)
    assert r.status_code == 200
    assert any(x["name"] == "Password Reset" for x in r.json())


def test_admin_can_update_canned_response(client, admin_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    rid = r.json()["id"]
    r2 = client.put(f"/api/canned-responses/{rid}", json={"name": "Updated", "body": "New body"}, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["name"] == "Updated"


def test_technician_cannot_update_canned_response(client, admin_headers, tech_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    rid = r.json()["id"]
    r2 = client.put(f"/api/canned-responses/{rid}", json=RESPONSE_BASE, headers=tech_headers)
    assert r2.status_code == 403


def test_admin_can_delete_canned_response(client, admin_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    rid = r.json()["id"]
    r2 = client.delete(f"/api/canned-responses/{rid}", headers=admin_headers)
    assert r2.status_code == 204


def test_technician_cannot_delete_canned_response(client, admin_headers, tech_headers):
    r = client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers)
    rid = r.json()["id"]
    r2 = client.delete(f"/api/canned-responses/{rid}", headers=tech_headers)
    assert r2.status_code == 403


def test_update_404(client, admin_headers):
    r = client.put("/api/canned-responses/999999", json=RESPONSE_BASE, headers=admin_headers)
    assert r.status_code == 404


def test_canned_responses_disabled_returns_503(client, admin_headers, tech_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_CANNED_RESPONSES", False)
    try:
        assert client.get("/api/canned-responses", headers=tech_headers).status_code == 503
        assert client.post("/api/canned-responses", json=RESPONSE_BASE, headers=admin_headers).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_CANNED_RESPONSES", True)
