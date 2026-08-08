"""Tests for staff Login page appearance settings (single-row, admin-managed, public read)."""

LOGIN_BRANDING_UPDATE = {
    "company_name": "Acme IT",
    "subtitle": "staff portal",
    "primary_color": "#123456",
    "accent_color": "#abcdef",
    "text_color": "#111111",
    "muted_color": "#222222",
    "on_color_text": "#333333",
    "logo_url": "https://example.com/logo.png",
}


def test_public_get_returns_defaults_without_auth(client):
    r = client.get("/api/login-branding/public")
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Your Company"
    assert data["subtitle"] == "internal use only"
    assert data["primary_color"] == "#2563EB"
    assert data["text_color"] == "#0D1B2A"
    assert data["muted_color"] == "#5B6D82"
    assert data["on_color_text"] == "#FFFFFF"


def test_admin_get_requires_auth(client):
    r = client.get("/api/login-branding")
    assert r.status_code == 401


def test_admin_get_rejects_technician(client, tech_headers):
    r = client.get("/api/login-branding", headers=tech_headers)
    assert r.status_code == 403


def test_admin_can_update_login_branding(client, admin_headers):
    r = client.put("/api/login-branding", json=LOGIN_BRANDING_UPDATE, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Acme IT"
    assert data["subtitle"] == "staff portal"
    assert data["primary_color"] == "#123456"
    assert data["text_color"] == "#111111"
    assert data["muted_color"] == "#222222"
    assert data["on_color_text"] == "#333333"


def test_technician_cannot_update_login_branding(client, tech_headers):
    r = client.put("/api/login-branding", json=LOGIN_BRANDING_UPDATE, headers=tech_headers)
    assert r.status_code == 403


def test_update_visible_via_public_endpoint(client, admin_headers):
    client.put("/api/login-branding", json=LOGIN_BRANDING_UPDATE, headers=admin_headers)
    r = client.get("/api/login-branding/public")
    assert r.status_code == 200
    assert r.json()["company_name"] == "Acme IT"


def test_login_branding_independent_of_staff_branding(client, admin_headers):
    before = client.get("/api/branding", headers=admin_headers).json()["company_name"]
    client.put("/api/login-branding", json=LOGIN_BRANDING_UPDATE, headers=admin_headers)
    r = client.get("/api/branding", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["company_name"] == before  # unaffected by the login-branding update
