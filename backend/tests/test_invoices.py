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


# ─── Ticket linking & billing-status sync tests ───────────────────────────────

def _make_ticket_with_client(client, admin_headers, name="Link Co", company="Link Co"):
    r = client.post("/api/clients", json={"name": name, "email": "link@example.com",
        "phone": "", "address": "", "client_type": "business", "company": company, "notes": ""}, headers=admin_headers)
    cid = r.json()["id"]
    r = client.post("/api/tickets", json={
        "status": "Open", "priority": "High", "client_type": "business",
        "client_id": cid, "client_name": name, "client_email": "link@example.com",
        "client_phone": "", "client_address": "", "title": "Linked work",
        "description": "", "internal_notes": "", "travel_fee": "travel_none",
        "service_lines": [{"service_id": "svc", "name": "Setup", "type": "flat",
            "rate": 200, "base": 0, "per_unit": 0, "per_unit_label": "",
            "unit_label": "unit", "qty": 1, "extra_qty": 0}],
        "hour_logs": [],
    }, headers=admin_headers)
    return cid, r.json()["id"]


def test_attach_ticket_imports_lines_and_marks_invoiced(client, admin_headers):
    cid, tid = _make_ticket_with_client(client, admin_headers)
    inv = client.post("/api/invoices", json={**INVOICE_BASE, "client_id": cid, "tax_rate": 0, "lines": []}, headers=admin_headers).json()
    r = client.post(f"/api/invoices/{inv['id']}/tickets", json={"ticket_ids": [tid]}, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert any(t["id"] == tid for t in data["linked_tickets"])
    assert data["total"] == 200
    # ticket now shows invoiced
    t = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    assert t["billing_status"] == "invoiced"


def test_detach_ticket_removes_lines_and_reverts_status(client, admin_headers):
    cid, tid = _make_ticket_with_client(client, admin_headers)
    inv = client.post("/api/invoices", json={**INVOICE_BASE, "client_id": cid, "tax_rate": 0, "lines": []}, headers=admin_headers).json()
    client.post(f"/api/invoices/{inv['id']}/tickets", json={"ticket_ids": [tid]}, headers=admin_headers)
    r = client.delete(f"/api/invoices/{inv['id']}/tickets/{tid}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["linked_tickets"] == []
    assert data["total"] == 0            # imported line removed, total recomputed
    t = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    assert t["billing_status"] == "unbilled"


def test_marking_invoice_paid_syncs_linked_tickets(client, admin_headers):
    cid, tid = _make_ticket_with_client(client, admin_headers)
    inv = client.post("/api/invoices", json={**INVOICE_BASE, "client_id": cid, "tax_rate": 0, "lines": []}, headers=admin_headers).json()
    client.post(f"/api/invoices/{inv['id']}/tickets", json={"ticket_ids": [tid]}, headers=admin_headers)
    # Mark invoice Paid via update
    full = client.get(f"/api/invoices/{inv['id']}", headers=admin_headers).json()
    payload = {k: full[k] for k in ["client_id", "client_name", "client_email", "client_address",
        "issue_date", "due_date", "notes", "tax_rate"]}
    payload["status"] = "Paid"
    payload["lines"] = [{"description": l["description"], "qty": l["qty"],
        "unit_price": l["unit_price"], "amount": l["amount"]} for l in full["lines"]]
    r = client.put(f"/api/invoices/{inv['id']}", json=payload, headers=admin_headers)
    assert r.status_code == 200
    t = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    assert t["billing_status"] == "paid"


def test_unbilled_tickets_scoped_company_wide(client, admin_headers):
    # Two contacts sharing one company; a ticket on each
    r1 = client.post("/api/clients", json={"name": "Contact A", "email": "a@co.com", "phone": "",
        "address": "", "client_type": "business", "company": "Shared Co", "notes": ""}, headers=admin_headers)
    r2 = client.post("/api/clients", json={"name": "Contact B", "email": "b@co.com", "phone": "",
        "address": "", "client_type": "business", "company": "Shared Co", "notes": ""}, headers=admin_headers)
    a, b = r1.json()["id"], r2.json()["id"]
    for cid, name in [(a, "Contact A"), (b, "Contact B")]:
        client.post("/api/tickets", json={"status": "Open", "priority": "Low", "client_type": "business",
            "client_id": cid, "client_name": name, "client_email": "", "client_phone": "",
            "client_address": "", "title": f"Work for {name}", "description": "", "internal_notes": "",
            "travel_fee": "travel_none", "service_lines": [], "hour_logs": []}, headers=admin_headers)
    # Invoice billed to contact A should still see contact B's ticket (same company)
    inv = client.post("/api/invoices", json={**INVOICE_BASE, "client_id": a, "tax_rate": 0, "lines": []}, headers=admin_headers).json()
    r = client.get(f"/api/invoices/{inv['id']}/unbilled-tickets", headers=admin_headers)
    assert r.status_code == 200
    names = {t["title"] for t in r.json()}
    assert "Work for Contact A" in names
    assert "Work for Contact B" in names


def test_unbilled_tickets_for_client_endpoint(client, admin_headers):
    """The pre-invoice picker (GET /invoices/unbilled-tickets?client_id=) must not be
    shadowed by the /{invoice_id} route and must return the company's unbilled tickets."""
    r1 = client.post("/api/clients", json={"name": "Preinv A", "email": "pa@co.com", "phone": "",
        "address": "", "client_type": "business", "company": "Preinv Co", "notes": ""}, headers=admin_headers)
    r2 = client.post("/api/clients", json={"name": "Preinv B", "email": "pb@co.com", "phone": "",
        "address": "", "client_type": "business", "company": "Preinv Co", "notes": ""}, headers=admin_headers)
    a, b = r1.json()["id"], r2.json()["id"]
    for cid, name in [(a, "Preinv A"), (b, "Preinv B")]:
        client.post("/api/tickets", json={"status": "Open", "priority": "Low", "client_type": "business",
            "client_id": cid, "client_name": name, "client_email": "", "client_phone": "",
            "client_address": "", "title": f"Pre work {name}", "description": "", "internal_notes": "",
            "travel_fee": "travel_none", "service_lines": [], "hour_logs": []}, headers=admin_headers)

    # No invoice exists yet — this is the exact request the new-invoice picker makes.
    r = client.get("/api/invoices/unbilled-tickets", params={"client_id": a}, headers=admin_headers)
    assert r.status_code == 200, f"route shadowed? got {r.status_code}: {r.text}"
    names = {t["title"] for t in r.json()}
    # Company-wide: billing to contact A still surfaces contact B's ticket
    assert "Pre work Preinv A" in names
    assert "Pre work Preinv B" in names


def test_unbilled_tickets_for_client_by_name(client, admin_headers):
    # Manual-entry invoices have no client_id; picker falls back to client_name match
    client.post("/api/tickets", json={"status": "Open", "priority": "Low", "client_type": "business",
        "client_name": "Nameonly Corp", "client_email": "", "client_phone": "",
        "client_address": "", "title": "Nameonly work", "description": "", "internal_notes": "",
        "travel_fee": "travel_none", "service_lines": [], "hour_logs": []}, headers=admin_headers)
    r = client.get("/api/invoices/unbilled-tickets", params={"client_name": "Nameonly Corp"}, headers=admin_headers)
    assert r.status_code == 200
    assert any(t["title"] == "Nameonly work" for t in r.json())
