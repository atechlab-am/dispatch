"""Tests for Quote/Invoice PDF + email appearance settings (single-row, admin-managed)."""

DOCUMENT_BRANDING_UPDATE = {
    "company_name": "Acme Consulting",
    "website": "acme-consulting.example",
    "primary_color": "#123456",
    "accent_color": "#abcdef",
    "logo_url": "https://example.com/doc-logo.png",
    "footer_text": "Questions? Call us anytime.",
}


def test_get_returns_defaults(client, admin_headers):
    r = client.get("/api/document-branding", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "ATech Solutions"
    assert data["primary_color"] == "#1A5CBA"
    assert data["accent_color"] == "#E8A020"
    assert data["footer_text"] == "Thank you for your business"


def test_get_requires_auth(client):
    r = client.get("/api/document-branding")
    assert r.status_code == 401


def test_admin_can_update_document_branding(client, admin_headers):
    r = client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Acme Consulting"
    assert data["website"] == "acme-consulting.example"
    assert data["primary_color"] == "#123456"
    assert data["footer_text"] == "Questions? Call us anytime."


def test_technician_cannot_update_document_branding(client, tech_headers):
    r = client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=tech_headers)
    assert r.status_code == 403


def test_technician_can_read_document_branding(client, tech_headers):
    r = client.get("/api/document-branding", headers=tech_headers)
    assert r.status_code == 200


def test_document_branding_independent_of_other_branding_tables(client, admin_headers):
    before_staff = client.get("/api/branding", headers=admin_headers).json()["company_name"]
    before_login = client.get("/api/login-branding", headers=admin_headers).json()["company_name"]
    client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=admin_headers)
    r1 = client.get("/api/branding", headers=admin_headers)
    r2 = client.get("/api/login-branding", headers=admin_headers)
    assert r1.json()["company_name"] == before_staff
    assert r2.json()["company_name"] == before_login


def _reset_document_branding(client, admin_headers):
    client.put("/api/document-branding", json={
        "company_name": "ATech Solutions", "website": "atechsolutions.org",
        "primary_color": "#1A5CBA", "accent_color": "#E8A020",
        "logo_url": "", "footer_text": "Thank you for your business",
    }, headers=admin_headers)


def test_invoice_pdf_reflects_custom_branding(client, admin_headers):
    r = client.post("/api/invoices", json={
        "client_name": "Branding Test Co", "client_email": "", "client_address": "",
        "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=admin_headers)
    try:
        pdf = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
        assert pdf.status_code == 200
        assert "Acme Consulting" in pdf.text
        assert "acme-consulting.example" in pdf.text
        assert "#123456" in pdf.text
        assert "Questions? Call us anytime." in pdf.text
        assert "ATechSolutions" not in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)


def test_quote_pdf_reflects_custom_branding(client, admin_headers):
    r = client.post("/api/quotes", json={
        "client_name": "Branding Test Co", "client_email": "", "client_address": "",
        "tax_rate": 0, "notes": "",
        "lines": [{"description": "Consulting", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    quote_id = r.json()["id"]

    client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=admin_headers)
    try:
        pdf = client.get(f"/api/quotes/{quote_id}/pdf", headers=admin_headers)
        assert pdf.status_code == 200
        assert "Acme Consulting" in pdf.text
        assert "acme-consulting.example" in pdf.text
        assert "#123456" in pdf.text
        assert "ATechSolutions" not in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)


def test_invoice_pdf_uses_logo_image_when_configured(client, admin_headers):
    r = client.post("/api/invoices", json={
        "client_name": "Logo Test Co", "client_email": "", "client_address": "",
        "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    client.put("/api/document-branding", json=DOCUMENT_BRANDING_UPDATE, headers=admin_headers)
    try:
        pdf = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
        assert f'<img src="{DOCUMENT_BRANDING_UPDATE["logo_url"]}"' in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)
