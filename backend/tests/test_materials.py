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


# ─── Category ──────────────────────────────────────────────────────────────────

def test_create_material_with_category(client, admin_headers):
    r = client.post("/api/materials", json={**MATERIAL_BASE, "name": "Switch 8-port", "category": "Networking"}, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["category"] == "Networking"


def test_update_material_category(client, admin_headers):
    r = client.post("/api/materials", json={**MATERIAL_BASE, "name": "Patch Panel"}, headers=admin_headers)
    mid = r.json()["id"]
    r2 = client.put(f"/api/materials/{mid}", json={**MATERIAL_BASE, "name": "Patch Panel", "category": "Networking"}, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["category"] == "Networking"


def test_list_materials_sorted_by_category_then_name_then_price(client, admin_headers):
    client.post("/api/materials", json={"name": "Zebra Cable", "category": "Networking", "unit_price": 5}, headers=admin_headers)
    client.post("/api/materials", json={"name": "Alpha Router", "category": "Networking", "unit_price": 5}, headers=admin_headers)
    client.post("/api/materials", json={"name": "Screwdriver", "category": "Tools", "unit_price": 5}, headers=admin_headers)
    listed = client.get("/api/materials", headers=admin_headers).json()
    networking_names = [m["name"] for m in listed if m["category"] == "Networking"]
    assert networking_names.index("Alpha Router") < networking_names.index("Zebra Cable")
    categories = [m["category"] for m in listed]
    assert categories == sorted(categories)


def test_list_material_categories_distinct_and_sorted(client, admin_headers):
    client.post("/api/materials", json={**MATERIAL_BASE, "name": "Item A", "category": "Zeta"}, headers=admin_headers)
    client.post("/api/materials", json={**MATERIAL_BASE, "name": "Item B", "category": "Alpha"}, headers=admin_headers)
    client.post("/api/materials", json={**MATERIAL_BASE, "name": "Item C", "category": "Alpha"}, headers=admin_headers)
    client.post("/api/materials", json={**MATERIAL_BASE, "name": "Item D", "category": ""}, headers=admin_headers)
    r = client.get("/api/materials/categories", headers=admin_headers)
    assert r.status_code == 200
    cats = r.json()
    assert "" not in cats
    assert cats == sorted(set(cats))
    assert "Alpha" in cats and "Zeta" in cats
    assert cats.count("Alpha") == 1


def test_import_csv_with_category_column(client, admin_headers):
    csv_content = "name,category,unit_price\nHDMI Cable,AV,15.00\n"
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["name"] == "HDMI Cable")
    assert row["category"] == "AV"


def test_import_csv_category_too_long_reported_as_row_error(client, admin_headers):
    long_category = "x" * 121
    csv_content = f"name,category,unit_price\nGood Row,{long_category},5.00\n"
    r = client.post("/api/materials/import", headers=admin_headers, files=_csv_file(csv_content))
    assert r.status_code == 200
    data = r.json()
    assert data["created"] == 0
    assert len(data["errors"]) == 1
    assert "category" in data["errors"][0]["message"].lower()


# ─── Bulk endpoints ─────────────────────────────────────────────────────────────

def _make_materials(client, admin_headers, n=3, **overrides):
    ids = []
    for i in range(n):
        payload = {**MATERIAL_BASE, "name": f"Bulk Item {i}", **overrides}
        r = client.post("/api/materials", json=payload, headers=admin_headers)
        ids.append(r.json()["id"])
    return ids


def test_bulk_set_category(client, admin_headers):
    ids = _make_materials(client, admin_headers)
    r = client.post("/api/materials/bulk/category", json={"ids": ids, "category": "Bulk Cat"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["updated"] == 3
    listed = client.get("/api/materials", headers=admin_headers).json()
    for m in listed:
        if m["id"] in ids:
            assert m["category"] == "Bulk Cat"


def test_bulk_set_category_ignores_unknown_ids(client, admin_headers):
    ids = _make_materials(client, admin_headers, n=1)
    r = client.post("/api/materials/bulk/category", json={"ids": ids + [999999], "category": "X"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["updated"] == 1


def test_bulk_category_empty_result_set_400(client, admin_headers):
    r = client.post("/api/materials/bulk/category", json={"ids": [999999], "category": "X"}, headers=admin_headers)
    assert r.status_code == 400


def test_bulk_category_requires_admin(client, tech_headers):
    r = client.post("/api/materials/bulk/category", json={"ids": [1], "category": "X"}, headers=tech_headers)
    assert r.status_code == 403


def test_bulk_delete(client, admin_headers):
    ids = _make_materials(client, admin_headers)
    r = client.post("/api/materials/bulk/delete", json={"ids": ids}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["updated"] == 3
    listed = client.get("/api/materials", headers=admin_headers).json()
    remaining_ids = {m["id"] for m in listed}
    assert not remaining_ids & set(ids)


def test_bulk_delete_requires_admin(client, tech_headers):
    r = client.post("/api/materials/bulk/delete", json={"ids": [1]}, headers=tech_headers)
    assert r.status_code == 403


def test_bulk_price_percent(client, admin_headers):
    ids = _make_materials(client, admin_headers, n=1, unit_price=100)
    r = client.post("/api/materials/bulk/price", json={"ids": ids, "mode": "percent", "value": 10}, headers=admin_headers)
    assert r.status_code == 200
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["id"] == ids[0])
    assert row["unit_price"] == 110.0


def test_bulk_price_flat(client, admin_headers):
    ids = _make_materials(client, admin_headers, n=1, unit_price=100)
    r = client.post("/api/materials/bulk/price", json={"ids": ids, "mode": "flat", "value": -20}, headers=admin_headers)
    assert r.status_code == 200
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["id"] == ids[0])
    assert row["unit_price"] == 80.0


def test_bulk_price_set(client, admin_headers):
    ids = _make_materials(client, admin_headers, n=1, unit_price=100)
    r = client.post("/api/materials/bulk/price", json={"ids": ids, "mode": "set", "value": 42.5}, headers=admin_headers)
    assert r.status_code == 200
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["id"] == ids[0])
    assert row["unit_price"] == 42.5


def test_bulk_price_clamped_at_zero(client, admin_headers):
    ids = _make_materials(client, admin_headers, n=1, unit_price=10)
    r = client.post("/api/materials/bulk/price", json={"ids": ids, "mode": "flat", "value": -1000}, headers=admin_headers)
    assert r.status_code == 200
    listed = client.get("/api/materials", headers=admin_headers).json()
    row = next(m for m in listed if m["id"] == ids[0])
    assert row["unit_price"] == 0


def test_bulk_price_requires_admin(client, tech_headers):
    r = client.post("/api/materials/bulk/price", json={"ids": [1], "mode": "flat", "value": 1}, headers=tech_headers)
    assert r.status_code == 403


def test_bulk_endpoints_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_MATERIALS", False)
    try:
        assert client.post("/api/materials/bulk/category", json={"ids": [1], "category": "X"}, headers=admin_headers).status_code == 503
        assert client.post("/api/materials/bulk/delete", json={"ids": [1]}, headers=admin_headers).status_code == 503
        assert client.post("/api/materials/bulk/price", json={"ids": [1], "mode": "flat", "value": 1}, headers=admin_headers).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_MATERIALS", True)
