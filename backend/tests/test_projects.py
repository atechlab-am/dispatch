"""Tests for Projects — a top-level container wrapping one Quote -> Ticket -> Invoice chain."""
from app import config

QUOTE_LINE = {"description": "Consulting", "qty": 2, "unit_price": 100, "amount": 200}


def test_create_project_creates_linked_draft_quote(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "Office Network Upgrade"})
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("PRJ-")
    assert data["name"] == "Office Network Upgrade"
    quote_id = data["quote_id"]
    assert quote_id.startswith("QUO-")

    q = client.get(f"/api/quotes/{quote_id}", headers=admin_headers)
    assert q.status_code == 200
    qdata = q.json()
    assert qdata["status"] == "Draft"
    assert qdata["project_name"] == "Office Network Upgrade"
    assert qdata["project_id"] == data["id"]


def test_create_project_requires_name(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": ""})
    assert r.status_code == 422


def test_list_projects_shows_quote_only_stage(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "Quote Only Project"})
    pid = r.json()["id"]

    listed = client.get("/api/projects", headers=admin_headers).json()
    match = next(p for p in listed["items"] if p["id"] == pid)
    assert match["stage"] == "Quote"
    assert match["quote_status"] == "Draft"
    assert match["ticket_id"] is None
    assert match["invoice_id"] is None


def test_list_projects_shows_ticket_stage_after_approval(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "Ticket Stage Project"})
    pid = r.json()["id"]
    qid = r.json()["quote_id"]

    # fill in the quote enough to approve it
    client.put(f"/api/quotes/{qid}", headers=admin_headers, json={
        "client_name": "Acme Corp", "client_email": "acme@example.com", "client_address": "",
        "project_name": "Ticket Stage Project", "tax_rate": 0, "notes": "", "lines": [QUOTE_LINE],
    })
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})

    listed = client.get("/api/projects", headers=admin_headers).json()
    match = next(p for p in listed["items"] if p["id"] == pid)
    assert match["stage"] == "Ticket"
    assert match["ticket_id"] is not None
    assert match["ticket_status"] == "Open"
    assert match["invoice_id"] is None


def test_list_projects_shows_invoice_stage_after_conversion(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "Invoice Stage Project"})
    pid = r.json()["id"]
    qid = r.json()["quote_id"]

    client.put(f"/api/quotes/{qid}", headers=admin_headers, json={
        "client_name": "Acme Corp", "client_email": "acme@example.com", "client_address": "",
        "project_name": "Invoice Stage Project", "tax_rate": 0, "notes": "", "lines": [QUOTE_LINE],
    })
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Sent"})
    client.patch(f"/api/quotes/{qid}/status", headers=admin_headers, json={"status": "Approved"})
    conv = client.post(f"/api/quotes/{qid}/convert", headers=admin_headers)
    invoice_id = conv.json()["invoice_id"]

    listed = client.get("/api/projects", headers=admin_headers).json()
    match = next(p for p in listed["items"] if p["id"] == pid)
    assert match["stage"] == "Invoice"
    assert match["invoice_id"] == invoice_id


def test_get_project_by_id(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "Single Fetch Project"})
    pid = r.json()["id"]
    got = client.get(f"/api/projects/{pid}", headers=admin_headers)
    assert got.status_code == 200
    assert got.json()["name"] == "Single Fetch Project"


def test_get_project_not_found(client, admin_headers):
    r = client.get("/api/projects/PRJ-0000-00000", headers=admin_headers)
    assert r.status_code == 404


def test_projects_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_QUOTES", False)
    try:
        assert client.get("/api/projects", headers=admin_headers).status_code == 503
        assert client.post("/api/projects", headers=admin_headers, json={"name": "X"}).status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_QUOTES", True)


def test_quote_without_project_is_unaffected(client, admin_headers):
    r = client.post("/api/quotes", headers=admin_headers, json={
        "client_name": "Acme Corp", "client_email": "", "client_address": "",
        "tax_rate": 0, "notes": "", "lines": [QUOTE_LINE],
    })
    assert r.status_code == 201
    assert r.json()["project_id"] is None
