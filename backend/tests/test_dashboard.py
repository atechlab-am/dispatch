"""Tests for the dashboard endpoint."""

from datetime import datetime, timedelta, timezone

import app.database as _db_module
from app.models.models import Ticket


def _make_ticket(**overrides):
    """Insert a ticket directly via the DB session, bypassing the API, so
    sla_resolution_due/sla_paused_at can be set to arbitrary values that the
    normal create/update endpoints wouldn't let a test set directly."""
    db = _db_module.SessionLocal()
    try:
        n = db.query(Ticket).count()
        ticket = Ticket(
            id=f"TKT-TEST-{n:05d}",
            title="Dashboard SLA test ticket",
            **{"status": "Open", **overrides},
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return ticket.id
    finally:
        db.close()


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


def test_dashboard_sla_breach_excludes_paused_tickets(client, admin_headers):
    """A ticket on hold (Awaiting Client, sla_paused_at set) has its SLA clock
    stopped and must not count as breached even if sla_resolution_due is in
    the past — regression test for the dashboard not honoring sla_paused_at."""
    now = datetime.now(timezone.utc)
    past_due = now - timedelta(hours=3)

    breached_id = _make_ticket(
        status="Open",
        sla_resolution_due=past_due,
        sla_paused_at=None,
    )
    paused_id = _make_ticket(
        status="Awaiting Client",
        sla_resolution_due=past_due,
        sla_paused_at=now - timedelta(hours=1),
    )

    dash = client.get("/api/dashboard", headers=admin_headers).json()
    urgent_ids = {t["id"] for t in dash["sla_urgent"]}

    assert breached_id in urgent_ids
    assert paused_id not in urgent_ids


def test_dashboard_includes_lead_stats(client, admin_headers):
    client.post("/api/leads", json={"business_name": "Dashboard Lead Co"}, headers=admin_headers)
    r = client.get("/api/dashboard", headers=admin_headers)
    data = r.json()
    assert "lead_stats" in data
    assert "lead_pipeline" in data
    assert "leads_follow_up" in data

    labels = {s["label"] for s in data["lead_stats"]}
    assert labels == {"Total Leads", "Active Leads", "Won", "Lost"}
    total_stat = next(s for s in data["lead_stats"] if s["label"] == "Total Leads")
    list_total = len(client.get("/api/leads", headers=admin_headers).json())
    assert total_stat["value"] == list_total


def test_dashboard_lead_pipeline_counts_by_stage(client, admin_headers):
    lead = client.post("/api/leads", json={"business_name": "Pipeline Lead Co"}, headers=admin_headers).json()
    client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "qualified"}, headers=admin_headers)

    r = client.get("/api/dashboard", headers=admin_headers)
    pipeline = {p["stage"]: p["count"] for p in r.json()["lead_pipeline"]}
    assert set(pipeline.keys()) == {"new", "contacted", "qualified", "proposal", "won", "lost"}
    assert pipeline["qualified"] >= 1


def test_dashboard_leads_follow_up_only_includes_scheduled(client, admin_headers):
    scheduled = client.post("/api/leads", json={
        "business_name": "Follow-up Needed Co", "follow_up_date": "2026-01-01", "follow_up_scheduled": True,
    }, headers=admin_headers).json()
    client.post("/api/leads", json={"business_name": "No Follow-up Co"}, headers=admin_headers)

    r = client.get("/api/dashboard", headers=admin_headers)
    ids = {l["id"] for l in r.json()["leads_follow_up"]}
    assert scheduled["id"] in ids
    assert all(l["follow_up_scheduled"] for l in r.json()["leads_follow_up"])


def test_dashboard_leads_follow_up_overdue_sorted_first(client, admin_headers):
    client.post("/api/leads", json={
        "business_name": "Future Follow-up Co", "follow_up_date": "2099-01-01", "follow_up_scheduled": True,
    }, headers=admin_headers)
    overdue = client.post("/api/leads", json={
        "business_name": "Overdue Follow-up Co", "follow_up_date": "2020-01-01", "follow_up_scheduled": True,
    }, headers=admin_headers).json()

    r = client.get("/api/dashboard", headers=admin_headers)
    follow_up = r.json()["leads_follow_up"]
    assert follow_up[0]["id"] == overdue["id"]


def test_dashboard_lead_stats_empty_when_feature_disabled(client, admin_headers, monkeypatch):
    from app import config as app_config
    monkeypatch.setattr(app_config, "FEATURE_LEADS", False)
    r = client.get("/api/dashboard", headers=admin_headers)
    data = r.json()
    assert data["lead_stats"] == []
    assert data["lead_pipeline"] == []
    assert data["leads_follow_up"] == []
