"""Tests for the materials catalog (admin-managed, used to autofill quote lines)."""
import io

from app import config

MATERIAL_BASE = {"name": "Cat6 Cable (per box)", "description": "1000ft box", "unit_price": 89.99}


def _csv_file(content: str, filename: str = "materials.csv"):
    return {"file": (filename, io.BytesIO(content.encode("utf-8")), "text/csv")}


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


# ─── CSV import ────────────────────────────────────────────────────────────────

def test_import_csv_creates_materials(client, admin_headers):
    csv_content = (
        "name,description,unit_price\n"
        "Cat6 Cable (per box),1000ft box,89.99\n"
        "RJ45 Connector,Pack of 100,12.50\n"
    )
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    data = r.json()
    assert data["created"] == 2
    assert data["errors"] == []

    listed = client.get("/api/materials", headers=admin_headers).json()
    names = {m["name"] for m in listed}
    assert "Cat6 Cable (per box)" in names
    assert "RJ45 Connector" in names
    rj45 = next(m for m in listed if m["name"] == "RJ45 Connector")
    assert rj45["unit_price"] == 12.50


def test_import_csv_missing_name_column_rejected(client, admin_headers):
    csv_content = "description,unit_price\nSomething,10\n"
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 400
    assert "name" in r.json()["detail"].lower()


def test_import_csv_defaults_description_and_price(client, admin_headers):
    csv_content = "name\nBare Wire Spool\n"
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["name"] == "Bare Wire Spool")
    assert row["description"] == ""
    assert row["unit_price"] == 0


def test_import_csv_reports_per_row_errors_without_blocking_valid_rows(client, admin_headers):
    csv_content = (
        "name,description,unit_price\n"
        "Good Row,fine,5.00\n"
        ",missing name,5.00\n"
        "Bad Price,oops,not-a-number\n"
        "Negative Price,oops,-3\n"
    )
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    data = r.json()
    assert data["created"] == 1
    assert len(data["errors"]) == 3
    rows_with_errors = {e["row"] for e in data["errors"]}
    assert rows_with_errors == {3, 4, 5}


def test_import_csv_accepts_dollar_sign_and_commas_in_price(client, admin_headers):
    csv_content = "name,description,unit_price\nExpensive Thing,,\"$1,234.56\"\n"
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["name"] == "Expensive Thing")
    assert row["unit_price"] == 1234.56


def test_import_csv_empty_file_rejected(client, admin_headers):
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(""))
    assert r.status_code == 400


def test_import_csv_requires_admin(client, tech_headers):
    csv_content = "name\nSomething\n"
    r = client.post("/api/materials/import", headers=tech_headers, files=_csv_file(csv_content))
    assert r.status_code == 403


def test_import_csv_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_MATERIALS", False)
    try:
        csv_content = "name\nSomething\n"
        r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
        assert r.status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_MATERIALS", True)
