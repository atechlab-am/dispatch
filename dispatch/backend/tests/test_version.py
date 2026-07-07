"""Tests for the version check endpoint."""


def test_version_check_shape(client, admin_headers):
    r = client.get("/api/version/check", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "current" in data
    assert "latest" in data
    assert "update_available" in data
    assert "configured" in data
    assert isinstance(data["update_available"], bool)


def test_version_check_current_is_string(client, admin_headers):
    r = client.get("/api/version/check", headers=admin_headers)
    assert isinstance(r.json()["current"], str)
    assert len(r.json()["current"]) > 0


def test_version_check_not_configured_when_no_env(client, admin_headers):
    """Without GITHUB_REPO/GITHUB_TOKEN set in the test env, configured should be False."""
    r = client.get("/api/version/check", headers=admin_headers)
    data = r.json()
    assert data["configured"] is False
    assert data["latest"] is None
    assert data["update_available"] is False


def test_version_check_requires_auth(client):
    r = client.get("/api/version/check")
    assert r.status_code in (401, 403)


def test_semver_comparison():
    from app.routers.version import _semver_gt
    assert _semver_gt("1.1.0", "1.0.0") is True
    assert _semver_gt("1.0.0", "1.0.0") is False
    assert _semver_gt("1.0.0", "1.1.0") is False
    assert _semver_gt("2.0.0", "1.9.9") is True
    assert _semver_gt("v1.1.0", "1.0.0") is True   # handles v prefix
