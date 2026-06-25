import pytest

INVOICE_BASE = {
    "client_name": "Invoice Client",
    "client_email": "invoiceclient@example.com",
    "client_address": "99 Invoice Rd",
    "status": "Draft",
    "issue_date": "2026-06-01",
    "due_date": "2026-06-30",
    "notes": "Test invoice",
    "tax_rate": 0.14975,
    "lines": [
        {"description": "Server Health Check", "qty": 1, "unit_price": 300.00, "amount": 300.00},
        {"description": "Labour", "qty": 2.0, "unit_price": 110.00, "amount": 220.00},
    ],
}


@pytest.fixture(scope="module")
def invoice_id(client, admin_headers):
    r = client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_create_invoice(client, admin_headers):
    r = client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("INV-")
    assert data["status"] == "Draft"
    assert data["client_name"] == "Invoice Client"
    assert len(data["lines"]) == 2


def test_invoice_id_format(invoice_id):
    parts = invoice_id.split("-")
    assert parts[0] == "INV"
    assert len(parts[1]) == 4
    assert len(parts[2]) == 5


def test_invoice_totals_computed(client, admin_headers):
    r = client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    data = r.json()
    assert float(data["subtotal"]) == pytest.approx(520.00)
    assert float(data["tax_amount"]) == pytest.approx(520.00 * 0.14975, abs=0.01)
    assert float(data["total"]) == pytest.approx(520.00 * 1.14975, abs=0.01)


def test_list_invoices(client, admin_headers, invoice_id):
    r = client.get("/api/invoices", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] >= 1


def test_list_invoices_status_filter(client, admin_headers):
    r = client.get("/api/invoices", params={"status": "Draft"}, headers=admin_headers)
    assert r.status_code == 200
    for inv in r.json()["items"]:
        assert inv["status"] == "Draft"


def test_get_invoice(client, admin_headers, invoice_id):
    r = client.get(f"/api/invoices/{invoice_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["client_email"] == "invoiceclient@example.com"


def test_get_invoice_not_found(client, admin_headers):
    r = client.get("/api/invoices/INV-0000-00000", headers=admin_headers)
    assert r.status_code == 404


def test_update_invoice_status(client, admin_headers, invoice_id):
    updated = {**INVOICE_BASE, "status": "Sent"}
    r = client.put(f"/api/invoices/{invoice_id}", json=updated, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "Sent"


def test_invalid_invoice_status_rejected(client, admin_headers):
    bad = {**INVOICE_BASE, "status": "Pending"}
    r = client.post("/api/invoices", json=bad, headers=admin_headers)
    assert r.status_code == 422


def test_delete_invoice(client, admin_headers):
    r = client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    iid = r.json()["id"]
    r = client.delete(f"/api/invoices/{iid}", headers=admin_headers)
    assert r.status_code == 204
    r = client.get(f"/api/invoices/{iid}", headers=admin_headers)
    assert r.status_code == 404


def test_unauthenticated_cannot_list_invoices(client):
    r = client.get("/api/invoices")
    assert r.status_code in (401, 403)
