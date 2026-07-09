"""Tests for the materials catalog (admin-managed, used to autofill quote lines)."""
from app import config

MATERIAL_BASE = {"name": "Cat6 Cable (per box)", "description": "1000ft box", "unit_price": 89.99}


def test_admin_can_create_material(client, admin_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Cat6 Cable (per box)"
    assert data["unit_price"] == 89.99


def test_technician_cannot_create_material(client, tech_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=tech_headers)
    assert r.status_code == 403


def test_technician_can_list_materials(client, admin_headers, tech_headers):
    client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    r = client.get("/api/materials", headers=tech_headers)
    assert r.status_code == 200
    assert any(x["name"] == "Cat6 Cable (per box)" for x in r.json())


def test_admin_can_update_material(client, admin_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    mid = r.json()["id"]
    r2 = client.put(f"/api/materials/{mid}", json={**MATERIAL_BASE, "unit_price": 99.99}, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["unit_price"] == 99.99


def test_technician_cannot_update_material(client, admin_headers, tech_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    mid = r.json()["id"]
    r2 = client.put(f"/api/materials/{mid}", json=MATERIAL_BASE, headers=tech_headers)
    assert r2.status_code == 403


def test_admin_can_delete_material(client, admin_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    mid = r.json()["id"]
    r2 = client.delete(f"/api/materials/{mid}", headers=admin_headers)
    assert r2.status_code == 204


def test_technician_cannot_delete_material(client, admin_headers, tech_headers):
    r = client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers)
    mid = r.json()["id"]
    r2 = client.delete(f"/api/materials/{mid}", headers=tech_headers)
    assert r2.status_code == 403


def test_update_404(client, admin_headers):
    r = client.put("/api/materials/999999", json=MATERIAL_BASE, headers=admin_headers)
    assert r.status_code == 404


def test_materials_disabled_returns_503(client, admin_headers, tech_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_MATERIALS", False)
    try:
        assert client.get("/api/materials", headers=tech_headers).status_code == 503
        assert client.post("/api/materials", json=MATERIAL_BASE, headers=admin_headers).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_MATERIALS", True)
