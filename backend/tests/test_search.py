"""Tests for the global search endpoint (tickets + clients + invoices + quotes)."""
from app import config

TICKET_BASE = {
    "status": "Open", "priority": "Medium", "client_type": "business",
    "client_name": "Search Widgets Inc", "client_email": "search@widgets.example.com",
    "client_phone": "", "client_address": "", "title": "Printer not working",
    "description": "", "internal_notes": "", "travel_fee": "travel_none",
    "service_lines": [], "hour_logs": [],
}

CLIENT_BASE = {
    "name": "Search Widgets Inc", "email": "info@widgets.example.com",
    "phone": "", "address": "", "client_type": "business", "company": "Search Widgets Inc", "notes": "",
}

INVOICE_BASE = {
    "client_name": "Search Widgets Inc", "client_email": "", "client_address": "",
    "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
    "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
}


def test_search_finds_matching_ticket(client, admin_headers):
    client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    r = client.get("/api/search", params={"q": "Search Widgets"}, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert any(t["client_name"] == "Search Widgets Inc" for t in data["tickets"])


def test_search_finds_matching_client(client, admin_headers):
    client.post("/api/clients", json=CLIENT_BASE, headers=admin_headers)
    r = client.get("/api/search", params={"q": "Search Widgets"}, headers=admin_headers)
    assert r.status_code == 200
    assert any(c["name"] == "Search Widgets Inc" for c in r.json()["clients"])


def test_search_finds_matching_invoice(client, admin_headers):
    client.post("/api/invoices", json=INVOICE_BASE, headers=admin_headers)
    r = client.get("/api/search", params={"q": "Search Widgets"}, headers=admin_headers)
    assert r.status_code == 200
    assert any(i["client_name"] == "Search Widgets Inc" for i in r.json()["invoices"])


def test_search_finds_matching_quote(client, admin_headers):
    quote_body = {**INVOICE_BASE}
    client.post("/api/quotes", json=quote_body, headers=admin_headers)
    r = client.get("/api/search", params={"q": "Search Widgets"}, headers=admin_headers)
    assert r.status_code == 200
    assert any(q["client_name"] == "Search Widgets Inc" for q in r.json()["quotes"])


def test_search_response_shape(client, admin_headers):
    r = client.get("/api/search", params={"q": "zzz_no_match_zzz"}, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"tickets", "clients", "invoices", "quotes"}
    assert data["tickets"] == []
    assert data["clients"] == []


def test_search_requires_query_param(client, admin_headers):
    r = client.get("/api/search", headers=admin_headers)
    assert r.status_code == 422


def test_search_disabled_returns_503(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_GLOBAL_SEARCH", False)
    try:
        r = client.get("/api/search", params={"q": "anything"}, headers=admin_headers)
        assert r.status_code == 503
    finally:
        monkeypatch.setattr(config, "FEATURE_GLOBAL_SEARCH", True)


def test_search_quotes_omitted_when_quotes_feature_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_QUOTES", False)
    try:
        r = client.get("/api/search", params={"q": "Search Widgets"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["quotes"] == []
    finally:
        monkeypatch.setattr(config, "FEATURE_QUOTES", True)
