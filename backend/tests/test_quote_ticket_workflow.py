"""Tests for the Quote -> Ticket -> Invoice workflow: auto-creating a ticket
when a quote is approved, seeding its hour logs from the quote's lines, and
the ticket_id filter used to look up a ticket's originating quote."""
from app import config

QUOTE_BASE = {
    "client_name": "Acme Corp",
    "client_email": "billing@acme.example.com",
    "client_address": "",
    "tax_rate": 0.1,
    "notes": "Site visit scheduled for next week.",
    "lines": [
        {"description": "Consulting", "item_type": "Labor", "qty": 2, "unit_price": 100, "amount": 200},
        {"description": "Cat6 Cable", "item_type": "Material", "qty": 3, "unit_price": 50, "amount": 150},
    ],
}


def _approve(client, admin_headers, qid):
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    return client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})


def test_approving_quote_auto_creates_linked_ticket(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]

    r2 = _approve(client, admin_headers, qid)
    assert r2.status_code == 200
    ticket_id = r2.json()["ticket_id"]
    assert ticket_id is not None
    assert ticket_id.startswith("TKT-")

    t = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    assert t.status_code == 200
    tdata = t.json()
    assert tdata["client_name"] == "Acme Corp"
    assert tdata["title"] == f"Quote {qid} approved — work order"
    assert tdata["description"] == "Site visit scheduled for next week."
    assert tdata["status"] == "Open"


def test_seeded_hour_logs_match_quote_lines(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = _approve(client, admin_headers, qid)
    ticket_id = r2.json()["ticket_id"]

    t = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    logs = t.json()["hour_logs"]
    assert len(logs) == 2

    by_desc = {l["description"]: l for l in logs}
    assert by_desc["[Labor] Consulting"]["hours"] == 1
    assert by_desc["[Labor] Consulting"]["rate"] == 200
    assert by_desc["[Material] Cat6 Cable"]["hours"] == 1
    assert by_desc["[Material] Cat6 Cable"]["rate"] == 150


def test_zero_line_quote_still_creates_ticket(client, admin_headers):
    body = {**QUOTE_BASE, "lines": []}
    r = client.post("/api/quotes", headers=admin_headers, json=body)
    qid = r.json()["id"]
    r2 = _approve(client, admin_headers, qid)
    assert r2.status_code == 200
    ticket_id = r2.json()["ticket_id"]
    assert ticket_id is not None

    t = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    assert t.json()["hour_logs"] == []


def test_list_quotes_ticket_id_filter(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = _approve(client, admin_headers, qid)
    ticket_id = r2.json()["ticket_id"]

    found = client.get(f"/api/quotes?ticket_id={ticket_id}", headers=admin_headers)
    assert found.status_code == 200
    items = found.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == qid

    none_found = client.get("/api/quotes?ticket_id=TKT-2026-99999", headers=admin_headers)
    assert none_found.json()["items"] == []


def test_ticket_creation_failure_does_not_block_quote_approval(client, admin_headers, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr("app.routers.quotes._make_ticket_id", boom)
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    r2 = _approve(client, admin_headers, qid)
    assert r2.status_code == 200
    assert r2.json()["status"] == "Approved"
    assert r2.json()["ticket_id"] is None


def test_quotes_disabled_blocks_whole_flow(client, admin_headers, monkeypatch):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    monkeypatch.setattr(config, "FEATURE_QUOTES", False)
    try:
        r2 = client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
        assert r2.status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_QUOTES", True)


def test_dashboard_funnel_counts(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json=QUOTE_BASE)
    qid = r.json()["id"]
    _approve(client, admin_headers, qid)

    dash = client.get("/api/dashboard", headers=admin_headers).json()
    funnel = {f["label"]: f["count"] for f in dash["funnel"]}
    assert funnel["Quotes Approved"] >= 1
    assert funnel["Tickets Created"] >= 1
    assert funnel["Tickets Created"] <= funnel["Quotes Approved"]
    assert funnel["Invoices Converted"] <= funnel["Tickets Created"]


def test_dashboard_funnel_empty_when_quotes_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_QUOTES", False)
    try:
        dash = client.get("/api/dashboard", headers=admin_headers).json()
        assert dash["funnel"] == []
    finally:
        monkeypatch.setattr(config, "FEATURE_QUOTES", True)
