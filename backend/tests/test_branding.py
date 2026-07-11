"""Tests for company-wide branding/appearance settings (single-row, admin-managed)."""

BRANDING_UPDATE = {
    "company_name": "Acme IT",
    "tagline": "Custom Tagline",
    "primary_color": "#123456",
    "accent_color": "#abcdef",
    "text_color": "#111111",
    "muted_color": "#222222",
    "on_color_text": "#333333",
    "logo_url": "https://example.com/logo.png",
    "favicon_url": "",
    "sidebar_dark": False,
}


def test_get_branding_returns_defaults_when_unconfigured(client, tech_headers):
    r = client.get("/api/branding", headers=tech_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "ATech Solutions"
    assert data["primary_color"] == "#1A5CBA"
    assert data["text_color"] == "#0D1B2A"
    assert data["muted_color"] == "#5B6D82"
    assert data["on_color_text"] == "#FFFFFF"
    assert data["sidebar_dark"] is True


def test_admin_can_update_branding(client, admin_headers):
    r = client.put("/api/branding", json=BRANDING_UPDATE, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Acme IT"
    assert data["primary_color"] == "#123456"
    assert data["text_color"] == "#111111"
    assert data["muted_color"] == "#222222"
    assert data["on_color_text"] == "#333333"
    assert data["sidebar_dark"] is False


def test_branding_update_persists_across_get(client, admin_headers, tech_headers):
    client.put("/api/branding", json=BRANDING_UPDATE, headers=admin_headers)
    r = client.get("/api/branding", headers=tech_headers)
    assert r.status_code == 200
    assert r.json()["company_name"] == "Acme IT"
    assert r.json()["tagline"] == "Custom Tagline"


def test_technician_cannot_update_branding(client, tech_headers):
    r = client.put("/api/branding", json=BRANDING_UPDATE, headers=tech_headers)
    assert r.status_code == 403


def test_updating_branding_does_not_clobber_unrelated_fields_on_next_read(client, admin_headers):
    client.put("/api/branding", json=BRANDING_UPDATE, headers=admin_headers)
    second_update = {**BRANDING_UPDATE, "company_name": "Renamed Co"}
    r = client.put("/api/branding", json=second_update, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Renamed Co"
    assert data["primary_color"] == "#123456"  # unchanged field from first update carries through
