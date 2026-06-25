"""Tests for the dashboard endpoint."""


def test_dashboard_returns_expected_shape(client, admin_headers):
    r = client.get("/api/dashboard", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "stats" in data
    assert "my_active" in data
    assert "sla_urgent" in data
    assert "recent_open" in data


def test_dashboard_stats_labels(client, admin_headers):
    r = client.get("/api/dashboard", headers=admin_headers)
    labels = {s["label"] for s in r.json()["stats"]}
    assert "Total Tickets" in labels
    assert "Active" in labels
    assert "Resolved / Closed" in labels
    assert "Urgent" in labels
    assert "SLA Breached" in labels
    assert "SLA Warning (< 2h)" in labels


def test_dashboard_stats_values_are_non_negative(client, admin_headers):
    r = client.get("/api/dashboard", headers=admin_headers)
    for s in r.json()["stats"]:
        assert s["value"] >= 0


def test_dashboard_my_active_only_mine(client, admin_headers):
    """Tickets in my_active should be created by the logged-in user."""
    r = client.get("/api/dashboard", headers=admin_headers)
    me = client.get("/api/auth/me", headers=admin_headers).json()
    for t in r.json()["my_active"]:
        assert t["created_by"] == me["id"]


def test_dashboard_requires_auth(client):
    r = client.get("/api/dashboard")
    assert r.status_code in (401, 403)


def test_dashboard_total_tickets_matches_list(client, admin_headers):
    dash = client.get("/api/dashboard", headers=admin_headers).json()
    total_stat = next(s for s in dash["stats"] if s["label"] == "Total Tickets")
    list_total = client.get("/api/tickets", headers=admin_headers).json()["total"]
    assert total_stat["value"] == list_total
