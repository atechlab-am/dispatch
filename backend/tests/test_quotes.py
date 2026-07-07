"""Tests for quotes/estimates and convert-to-invoice."""
from app import config

QUOTE_BASE = {
    "client_name": "Acme Corp",
    "client_email": "billing@acme.example.com",
    "client_address": "",
    "tax_rate": 0.1,
    "notes": "",
    "lines": [
        {"description": "Consulting", "qty": 2, "unit_price": 100, "amount": 200},
    ],
}


def test_create_quote(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("QUO-")
    assert data["status"] == "Draft"
    assert data["subtotal"] == 200
    assert data["tax_amount"] == 20
    assert data["total"] == 220
    assert len(data["lines"]) == 1


def test_list_quotes(client, admin_headers):
    client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    r = client.get("/api/quotes", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_get_quote(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.get(f"/api/quotes/{qid}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == qid


def test_get_quote_404(client, admin_headers):
    r = client.get("/api/quotes/QUO-2026-99999", headers=admin_headers)
    assert r.status_code == 404


def test_update_quote_replaces_lines(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.put(f"/api/quotes/{qid}", headers=admin_headers, json={
        **QUOTE_BASE,
        "lines": [{"description": "New line", "qty": 1, "unit_price": 50, "amount": 50}],
    })
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["lines"]) == 1
    assert data["lines"][0]["description"] == "New line"
    assert data["subtotal"] == 50


def test_cannot_update_non_draft_quote(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    r2 = client.put(f"/api/quotes/{qid}", headers=admin_headers, json=QUOTE_BASE)
    assert r2.status_code == 400


def test_delete_quote(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.delete(f"/api/quotes/{qid}", headers=admin_headers)
    assert r2.status_code == 204
    assert client.get(f"/api/quotes/{qid}", headers=admin_headers).status_code == 404


def test_status_transitions_draft_to_sent_to_approved(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "Sent"
    r3 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
    assert r3.status_code == 200
    assert r3.json()["status"] == "Approved"


def test_invalid_status_transition_rejected(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    # Draft -> Approved is not allowed (must go through Sent)
    r2 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
    assert r2.status_code == 400


def test_terminal_status_cannot_transition_again(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Rejected"})
    r2 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    assert r2.status_code == 400


def test_convert_approved_quote_to_invoice(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})

    r2 = client.post(f"/api/quotes/{qid}/convert", headers=admin_headers)
    assert r2.status_code == 201
    invoice_id = r2.json()["invoice_id"]
    assert invoice_id.startswith("INV-")

    inv = client.get(f"/api/invoices/{invoice_id}", headers=admin_headers)
    assert inv.status_code == 200
    inv_data = inv.json()
    assert inv_data["client_name"] == "Acme Corp"
    assert inv_data["total"] == 220
    assert len(inv_data["lines"]) == 1

    q = client.get(f"/api/quotes/{qid}", headers=admin_headers)
    assert q.json()["converted_invoice_id"] == invoice_id


def test_cannot_convert_non_approved_quote(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.post(f"/api/quotes/{qid}/convert", headers=admin_headers)
    assert r2.status_code == 400


def test_cannot_convert_twice(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
    client.post(f"/api/quotes/{qid}/convert", headers=admin_headers)
    r2 = client.post(f"/api/quotes/{qid}/convert", headers=admin_headers)
    assert r2.status_code == 400


def test_quote_pdf(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.get(f"/api/quotes/{qid}/pdf", headers=admin_headers)
    assert r2.status_code == 200
    assert "Acme Corp" in r2.text


def test_send_quote_marks_sent(client, admin_headers, monkeypatch):
    sent = {}
    monkeypatch.setattr("app.routers.quotes.mail._send", lambda to, subject, html: sent.update(to=to, subject=subject))
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = client.post(f"/api/quotes/{qid}/send", headers=admin_headers, json={"to": "client@example.com", "message": ""})
    assert r2.status_code == 204
    assert sent["to"] == "client@example.com"
    q = client.get(f"/api/quotes/{qid}", headers=admin_headers)
    assert q.json()["status"] == "Sent"


# ─── Toggle ────────────────────────────────────────────────────────────────

def test_quotes_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_QUOTES", False)
    try:
        assert client.get("/api/quotes", headers=admin_headers).status_code == 503
        assert client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_QUOTES", True)
