"""Tests for the in-app documentation viewer."""


def test_list_docs_requires_auth(client):
    r = client.get("/api/docs")
    assert r.status_code in (401, 403)


def test_list_docs_shape(client, admin_headers):
    r = client.get("/api/docs", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    slugs = {p["slug"] for p in data}
    assert slugs == {"getting-started", "features", "operations"}


def test_get_doc_requires_auth(client):
    r = client.get("/api/docs/features")
    assert r.status_code in (401, 403)


def test_get_doc_returns_content(client, admin_headers):
    r = client.get("/api/docs/features", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["slug"] == "features"
    assert data["title"] == "Features"
    assert len(data["content"]) > 0
    assert "# Features" in data["content"]


def test_get_doc_unknown_slug_404s(client, admin_headers):
    r = client.get("/api/docs/nonexistent", headers=admin_headers)
    assert r.status_code == 404


def test_get_doc_tech_can_read(client, tech_headers):
    """Docs aren't admin-only — any authenticated user can read them."""
    r = client.get("/api/docs/operations", headers=tech_headers)
    assert r.status_code == 200
