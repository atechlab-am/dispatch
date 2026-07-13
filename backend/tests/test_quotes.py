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
    assert data["lines"][0]["item_type"] == "Labor"  # default when omitted
    assert data["project_name"] == ""  # default when omitted


def test_create_quote_with_project_name(client, admin_headers):
    body = {**QUOTE_BASE, "project_name": "Office Network Upgrade"}
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    assert r.status_code == 201
    data = r.json()
    assert data["project_name"] == "Office Network Upgrade"

    r2 = client.get("/api/quotes", headers=admin_headers)
    match = next(q for q in r2.json()["items"] if q["id"] == data["id"])
    assert match["project_name"] == "Office Network Upgrade"


def test_project_name_appears_in_pdf(client, admin_headers):
    body = {**QUOTE_BASE, "project_name": "Office Network Upgrade"}
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    qid = r.json()["id"]
    pdf = client.get(f"/api/quotes/{qid}/pdf", headers=admin_headers)
    assert "Office Network Upgrade" in pdf.text


def test_project_name_and_client_name_escaped_in_pdf(client, admin_headers):
    body = {**QUOTE_BASE, "client_name": "<script>alert(1)</script>", "project_name": "<b>Evil</b> Project"}
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    qid = r.json()["id"]
    pdf = client.get(f"/api/quotes/{qid}/pdf", headers=admin_headers)
    assert "<script>alert(1)</script>" not in pdf.text
    assert "&lt;script&gt;" in pdf.text
    assert "<b>Evil</b>" not in pdf.text
    assert "&lt;b&gt;Evil&lt;/b&gt;" in pdf.text


def test_approved_quote_with_project_name_sets_ticket_title(client, admin_headers):
    body = {**QUOTE_BASE, "project_name": "Office Network Upgrade"}
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    r2 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
    ticket_id = r2.json()["ticket_id"]

    t = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    assert t.json()["title"] == f"Office Network Upgrade — Quote {qid} approved"


def test_create_quote_with_material_line(client, admin_headers):
    body = {
        **QUOTE_BASE,
        "lines": [
            {"description": "Cat6 Cable", "item_type": "Material", "qty": 3, "unit_price": 50, "amount": 150},
        ],
    }
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    assert r.status_code == 201
    data = r.json()
    assert data["lines"][0]["item_type"] == "Material"
    assert data["lines"][0]["qty"] == 3


def test_create_quote_with_service_line(client, admin_headers):
    body = {
        **QUOTE_BASE,
        "lines": [
            {"description": "Network setup", "item_type": "Service", "qty": 1, "unit_price": 150, "amount": 150},
        ],
    }
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["lines"][0]["item_type"] == "Service"
    assert data["lines"][0]["qty"] == 1


def test_update_quote_with_mixed_line_types(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    body = {
        **QUOTE_BASE,
        "lines": [
            {"description": "Install labor", "item_type": "Labor", "qty": 4, "unit_price": 95, "amount": 380},
            {"description": "Cat6 cable", "item_type": "Material", "qty": 1, "unit_price": 220, "amount": 220},
            {"description": "Network setup", "item_type": "Service", "qty": 1, "unit_price": 150, "amount": 150},
        ],
    }
    r2 = client.put(f"/api/quotes/{qid}", headers=admin_headers, json=body)
    assert r2.status_code == 200, r2.text
    types = [l["item_type"] for l in r2.json()["lines"]]
    assert types == ["Labor", "Material", "Service"]


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


def test_list_quotes_active_status_filter_excludes_approved_rejected_expired(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    sent_id = r.json()["id"]
    client.patch(f"/api/quotes/{sent_id}/status", headers=admin_headers, json={"status": "Sent"})

    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    approved_id = r.json()["id"]
    client.patch(f"/api/quotes/{approved_id}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{approved_id}/status", headers=admin_headers, json={"status": "Approved"})

    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    rejected_id = r.json()["id"]
    client.patch(f"/api/quotes/{rejected_id}/status", headers=admin_headers, json={"status": "Rejected"})

    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    expired_id = r.json()["id"]
    client.patch(f"/api/quotes/{expired_id}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{expired_id}/status", headers=admin_headers, json={"status": "Expired"})

    r = client.get("/api/quotes", params={"status": "Active", "page_size": 100}, headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    ids = [q["id"] for q in items]
    statuses = {q["status"] for q in items}

    assert sent_id in ids
    assert approved_id not in ids
    assert rejected_id not in ids
    assert expired_id not in ids
    assert statuses <= {"Draft", "Sent"}


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
