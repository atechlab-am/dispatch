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


DEFAULT_DOCUMENT_BRANDING = {
    "company_name": "ATech Solutions", "website": "atechsolutions.org",
    "primary_color": "#1A5CBA", "accent_color": "#E8A020",
    "logo_url": "", "footer_text": "Thank you for your business",
    "font_size_header": 22, "font_size_body": 14, "font_size_table": 13, "font_size_totals": 15,
    "use_custom_invoice_template": False, "custom_invoice_template": "",
    "use_custom_quote_template": False, "custom_quote_template": "",
}


def _reset_document_branding(client, admin_headers):
    client.put("/api/document-branding", json=DEFAULT_DOCUMENT_BRANDING, headers=admin_headers)


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


def test_font_size_defaults_and_update(client, admin_headers):
    r = client.get("/api/document-branding", headers=admin_headers)
    data = r.json()
    assert data["font_size_header"] == 22
    assert data["font_size_body"] == 14
    assert data["font_size_table"] == 13
    assert data["font_size_totals"] == 15

    body = {**DEFAULT_DOCUMENT_BRANDING, "font_size_header": 30, "font_size_body": 10}
    r = client.put("/api/document-branding", json=body, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["font_size_header"] == 30
    assert r.json()["font_size_body"] == 10
    _reset_document_branding(client, admin_headers)


def test_font_size_out_of_range_rejected(client, admin_headers):
    body = {**DEFAULT_DOCUMENT_BRANDING, "font_size_header": 5}
    r = client.put("/api/document-branding", json=body, headers=admin_headers)
    assert r.status_code == 422


def test_invoice_pdf_reflects_custom_font_sizes(client, admin_headers):
    r = client.post("/api/invoices", json={
        "client_name": "Font Test Co", "client_email": "", "client_address": "",
        "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    body = {**DEFAULT_DOCUMENT_BRANDING, "font_size_header": 33, "font_size_body": 17}
    client.put("/api/document-branding", json=body, headers=admin_headers)
    try:
        pdf = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
        assert "font-size:33px" in pdf.text
        assert "font-size:17px" in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)


def test_get_template_placeholders(client, admin_headers):
    r = client.get("/api/document-branding/placeholders", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "lines_html" in data["invoice_placeholders"]
    assert "invoice_id" in data["invoice_placeholders"]
    assert "quote_id" in data["quote_placeholders"]
    assert "lines_html" in data["quote_placeholders"]


def test_save_rejects_custom_invoice_template_with_unknown_placeholder(client, admin_headers):
    body = {**DEFAULT_DOCUMENT_BRANDING, "use_custom_invoice_template": True,
            "custom_invoice_template": "<html>{{not_a_real_placeholder}}</html>"}
    r = client.put("/api/document-branding", json=body, headers=admin_headers)
    assert r.status_code == 422
    assert "not_a_real_placeholder" in r.json()["detail"]


def test_save_accepts_valid_custom_invoice_template(client, admin_headers):
    body = {**DEFAULT_DOCUMENT_BRANDING, "use_custom_invoice_template": True,
            "custom_invoice_template": "<html><body>{{company_name}} — {{invoice_id}}</body></html>"}
    r = client.put("/api/document-branding", json=body, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["use_custom_invoice_template"] is True
    _reset_document_branding(client, admin_headers)


def test_invoice_pdf_uses_custom_template_when_enabled(client, admin_headers):
    r = client.post("/api/invoices", json={
        "client_name": "Custom Template Co", "client_email": "", "client_address": "",
        "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    body = {**DEFAULT_DOCUMENT_BRANDING, "use_custom_invoice_template": True,
            "custom_invoice_template": "<html><body><h1>MY CUSTOM LAYOUT: {{invoice_id}} for {{client_name}}</h1>{{lines_html}}</body></html>"}
    client.put("/api/document-branding", json=body, headers=admin_headers)
    try:
        pdf = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
        assert pdf.status_code == 200
        assert f"MY CUSTOM LAYOUT: {invoice_id} for Custom Template Co" in pdf.text
        assert "Work" in pdf.text  # from lines_html
    finally:
        _reset_document_branding(client, admin_headers)


def test_quote_pdf_uses_custom_template_when_enabled(client, admin_headers):
    r = client.post("/api/quotes", json={
        "client_name": "Custom Quote Co", "client_email": "", "client_address": "",
        "tax_rate": 0, "notes": "",
        "lines": [{"description": "Consulting", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    quote_id = r.json()["id"]

    body = {**DEFAULT_DOCUMENT_BRANDING, "use_custom_quote_template": True,
            "custom_quote_template": "<html><body><h1>MY QUOTE LAYOUT: {{quote_id}}</h1>{{lines_html}}</body></html>"}
    client.put("/api/document-branding", json=body, headers=admin_headers)
    try:
        pdf = client.get(f"/api/quotes/{quote_id}/pdf", headers=admin_headers)
        assert pdf.status_code == 200
        assert f"MY QUOTE LAYOUT: {quote_id}" in pdf.text
        assert "Consulting" in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)


def test_invoice_falls_back_to_default_layout_when_custom_template_disabled(client, admin_headers):
    """Saving a custom template but leaving use_custom_invoice_template off
    must not affect real invoice PDFs at all."""
    r = client.post("/api/invoices", json={
        "client_name": "Disabled Template Co", "client_email": "", "client_address": "",
        "status": "Draft", "issue_date": "2026-06-01", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    body = {**DEFAULT_DOCUMENT_BRANDING, "use_custom_invoice_template": False,
            "custom_invoice_template": "<html><body>SHOULD NOT APPEAR {{invoice_id}}</body></html>"}
    client.put("/api/document-branding", json=body, headers=admin_headers)
    try:
        pdf = client.get(f"/api/invoices/{invoice_id}/pdf", headers=admin_headers)
        assert "SHOULD NOT APPEAR" not in pdf.text
        assert invoice_id in pdf.text
    finally:
        _reset_document_branding(client, admin_headers)


def test_preview_invoice_template_renders_with_sample_data(client, admin_headers):
    r = client.post("/api/document-branding/preview/invoice",
                     json={"template": "<html><body>{{company_name}} / {{invoice_id}}</body></html>"},
                     headers=admin_headers)
    assert r.status_code == 200
    assert "ATech Solutions" in r.text
    assert "INV-2026-00001" in r.text


def test_preview_invoice_template_rejects_unknown_placeholder(client, admin_headers):
    r = client.post("/api/document-branding/preview/invoice",
                     json={"template": "<html>{{totally_bogus}}</html>"},
                     headers=admin_headers)
    assert r.status_code == 422


def test_preview_quote_template_renders_with_sample_data(client, admin_headers):
    r = client.post("/api/document-branding/preview/quote",
                     json={"template": "<html><body>{{company_name}} / {{quote_id}}</body></html>"},
                     headers=admin_headers)
    assert r.status_code == 200
    assert "ATech Solutions" in r.text
    assert "QUO-2026-00001" in r.text


def test_preview_requires_auth(client):
    r = client.post("/api/document-branding/preview/invoice", json={"template": "<html></html>"})
    assert r.status_code == 401
