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


# ─── Payment tests ────────────────────────────────────────────────────────────

def test_record_payment(client, admin_headers, invoice_id):
    r = client.post(f"/api/invoices/{invoice_id}/payments", json={
        "amount": 100.00, "method": "E-Transfer", "note": "Partial", "payment_date": "2026-06-10",
    }, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert float(data["amount"]) == pytest.approx(100.00)
    assert data["method"] == "E-Transfer"
    assert data["invoice_id"] == invoice_id


def test_list_payments(client, admin_headers, invoice_id):
    r = client.get(f"/api/invoices/{invoice_id}/payments", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_invoice_balance_fields(client, admin_headers, invoice_id):
    r = client.get(f"/api/invoices/{invoice_id}", headers=admin_headers)
    data = r.json()
    assert "amount_paid" in data
    assert "balance" in data
    assert float(data["amount_paid"]) >= 100.00
    total = float(data["total"])
    assert float(data["balance"]) == pytest.approx(total - float(data["amount_paid"]), abs=0.01)


def test_auto_mark_paid_on_full_payment(client, admin_headers):
    r = client.post("/api/invoices", json={**INVOICE_BASE, "status": "Sent", "tax_rate": 0}, headers=admin_headers)
    iid = r.json()["id"]
    total = float(r.json()["total"])
    r = client.post(f"/api/invoices/{iid}/payments", json={
        "amount": total, "method": "Cash", "note": "", "payment_date": "2026-06-10",
    }, headers=admin_headers)
    assert r.status_code == 201
    r = client.get(f"/api/invoices/{iid}", headers=admin_headers)
    assert r.json()["status"] == "Paid"


def test_delete_payment(client, admin_headers, invoice_id):
    r = client.post(f"/api/invoices/{invoice_id}/payments", json={
        "amount": 50.00, "method": "Cash", "note": "", "payment_date": "2026-06-11",
    }, headers=admin_headers)
    pid = r.json()["id"]
    r = client.delete(f"/api/invoices/payments/{pid}", headers=admin_headers)
    assert r.status_code == 204


def test_payment_on_void_invoice_rejected(client, admin_headers):
    r = client.post("/api/invoices", json={**INVOICE_BASE, "status": "Void", "tax_rate": 0}, headers=admin_headers)
    iid = r.json()["id"]
    r = client.post(f"/api/invoices/{iid}/payments", json={
        "amount": 10.00, "method": "Cash", "note": "", "payment_date": "2026-06-10",
    }, headers=admin_headers)
    assert r.status_code == 400


def test_payment_nonexistent_invoice(client, admin_headers):
    r = client.post("/api/invoices/INV-0000-99999/payments", json={
        "amount": 10.00, "method": "Cash", "note": "", "payment_date": "2026-06-10",
    }, headers=admin_headers)
    assert r.status_code == 404


# ─── PDF / email tests ────────────────────────────────────────────────────────

def test_invoice_pdf_returns_html(client, admin_headers, invoice_id):
    r = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert invoice_id in r.text


def test_invoice_pdf_not_found(client, admin_headers):
    r = client.get("/api/invoices/INV-0000-00001/pdf", headers=admin_headers)
    assert r.status_code == 404


def test_send_invoice_no_smtp(client, admin_headers, invoice_id):
    # SMTP_HOST not set in test env → returns 204 (silently skips send)
    r = client.post(f"/api/invoices/{invoice_id}/send", json={
        "to": "test@example.com", "message": "Please pay.",
    }, headers=admin_headers)
    assert r.status_code == 204


def test_send_invoice_marks_sent(client, admin_headers):
    r = client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    iid = r.json()["id"]
    client.post(f"/api/invoices/{iid}/send", json={"to": "x@x.com", "message": ""}, headers=admin_headers)
    r = client.get(f"/api/invoices/{iid}", headers=admin_headers)
    assert r.json()["status"] == "Sent"


# ─── Client statement tests ───────────────────────────────────────────────────

def test_client_statement(client, admin_headers):
    # create a client
    r = client.post("/api/clients", json={"name": "Stmt Client", "email": "stmt@example.com",
        "phone": "", "address": "", "client_type": "business", "company": "", "notes": ""}, headers=admin_headers)
    cid = r.json()["id"]
    # create invoices for that client
    client.post("/api/invoices", json={**INVOICE_BASE, "client_id": cid, "tax_rate": 0}, headers=admin_headers)
    client.post("/api/invoices", json={**INVOICE_BASE, "client_id": cid, "tax_rate": 0, "status": "Void"}, headers=admin_headers)
    r = client.get(f"/api/clients/{cid}/statement", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["client"]["id"] == cid
    # void invoice excluded
    assert all(inv["status"] != "Void" for inv in data["invoices"])
    assert data["total_billed"] > 0
    assert "outstanding" in data


def test_client_statement_not_found(client, admin_headers):
    r = client.get("/api/clients/999999/statement", headers=admin_headers)
    assert r.status_code == 404
