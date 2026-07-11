"""Tests for Client Portal appearance settings (single-row, admin-managed, public read)."""

PORTAL_BRANDING_UPDATE = {
    "company_name": "Acme IT",
    "primary_color": "#123456",
    "accent_color": "#abcdef",
    "text_color": "#111111",
    "muted_color": "#222222",
    "on_color_text": "#333333",
    "logo_url": "https://example.com/portal-logo.png",
}


def test_public_get_returns_defaults_without_auth(client):
    r = client.get("/api/portal-branding/public")
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "ATech Solutions"
    assert data["primary_color"] == "#1A5CBA"
    assert data["text_color"] == "#0D1B2A"
    assert data["muted_color"] == "#5B6D82"
    assert data["on_color_text"] == "#FFFFFF"


def test_admin_get_requires_auth(client):
    r = client.get("/api/portal-branding")
    assert r.status_code == 401


def test_admin_get_rejects_technician(client, tech_headers):
    r = client.get("/api/portal-branding", headers=tech_headers)
    assert r.status_code == 403


def test_admin_can_update_portal_branding(client, admin_headers):
    r = client.put("/api/portal-branding", json=PORTAL_BRANDING_UPDATE, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Acme IT"
    assert data["primary_color"] == "#123456"
    assert data["text_color"] == "#111111"
    assert data["muted_color"] == "#222222"
    assert data["on_color_text"] == "#333333"


def test_technician_cannot_update_portal_branding(client, tech_headers):
    r = client.put("/api/portal-branding", json=PORTAL_BRANDING_UPDATE, headers=tech_headers)
    assert r.status_code == 403


def test_update_visible_via_public_endpoint(client, admin_headers):
    client.put("/api/portal-branding", json=PORTAL_BRANDING_UPDATE, headers=admin_headers)
    r = client.get("/api/portal-branding/public")
    assert r.status_code == 200
    assert r.json()["company_name"] == "Acme IT"


def test_portal_branding_independent_of_login_and_staff_branding(client, admin_headers):
    before_staff = client.get("/api/branding", headers=admin_headers).json()["company_name"]
    before_login = client.get("/api/login-branding", headers=admin_headers).json()["company_name"]
    client.put("/api/portal-branding", json=PORTAL_BRANDING_UPDATE, headers=admin_headers)
    r1 = client.get("/api/branding", headers=admin_headers)
    r2 = client.get("/api/login-branding", headers=admin_headers)
    assert r1.json()["company_name"] == before_staff
    assert r2.json()["company_name"] == before_login
