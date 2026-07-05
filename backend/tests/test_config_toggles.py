"""Tests for the Phase 12/13 feature toggles (FEATURE_* env vars).

All toggles default True, so existing behavior is unaffected unless a test
explicitly monkeypatches one off. This file covers: the /config endpoint,
each disabled feature's endpoints returning 503, and the cross-cutting no-op
behavior of write_audit()/create_notification() when their toggle is off,
regardless of which router/feature calls them.
"""
import pytest

from app import config

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Toggle Client",
    "client_email": "toggle@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for toggle tests",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}


@pytest.fixture()
def ticket_id(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


# ─── GET /api/config ──────────────────────────────────────────────────────────

def test_get_config_returns_all_six_keys(client, admin_headers):
    r = client.get("/api/config", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {
        "audit_log", "timer", "ar_aging", "notifications",
        "recurring_invoicing", "scheduling",
    }


def test_get_config_reflects_toggled_value(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_SCHEDULING", False)
    r = client.get("/api/config", headers=admin_headers)
    assert r.json()["scheduling"] is False


def test_get_config_requires_auth(client):
    r = client.get("/api/config")
    assert r.status_code in (401, 403)


# ─── Audit log ────────────────────────────────────────────────────────────────

def test_audit_endpoint_503_when_disabled(client, admin_headers, ticket_id, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_AUDIT_LOG", False)
    r = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers)
    assert r.status_code == 503


def test_write_audit_noops_when_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_AUDIT_LOG", False)
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    ticket_id = r.json()["id"]

    monkeypatch.setattr(config, "FEATURE_AUDIT_LOG", True)
    audit = client.get(f"/api/tickets/{ticket_id}/audit", headers=admin_headers).json()
    assert audit == []  # no "created" row was ever written while disabled


# ─── Timer ────────────────────────────────────────────────────────────────────

def test_timer_endpoints_503_when_disabled(client, admin_headers, ticket_id, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_TIMER", False)
    assert client.post(f"/api/tickets/{ticket_id}/timer", json={}, headers=admin_headers).status_code == 503
    assert client.post(f"/api/tickets/{ticket_id}/timer/stop", headers=admin_headers).status_code == 503
    assert client.get(f"/api/tickets/{ticket_id}/timer/active", headers=admin_headers).status_code == 503


# ─── AR aging ─────────────────────────────────────────────────────────────────

def test_ar_aging_503_when_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_AR_AGING", False)
    assert client.get("/api/reports/ar-aging", headers=admin_headers).status_code == 503
    assert client.get("/api/reports/ar-aging/csv", headers=admin_headers).status_code == 503


def test_other_reports_unaffected_by_ar_aging_toggle(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_AR_AGING", False)
    assert client.get("/api/reports/revenue", headers=admin_headers).status_code == 200


# ─── Notifications ────────────────────────────────────────────────────────────

def test_notifications_endpoints_503_when_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_NOTIFICATIONS", False)
    assert client.get("/api/notifications", headers=admin_headers).status_code == 503
    assert client.get("/api/notifications/unread-count", headers=admin_headers).status_code == 503
    assert client.post("/api/notifications/1/read", headers=admin_headers).status_code == 503
    assert client.post("/api/notifications/read-all", headers=admin_headers).status_code == 503


def test_create_notification_noops_when_disabled(client, admin_headers, tech_headers, monkeypatch):
    tech_id = client.get("/api/auth/me", headers=tech_headers).json()["id"]

    monkeypatch.setattr(config, "FEATURE_NOTIFICATIONS", False)
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    assert r.status_code == 201

    monkeypatch.setattr(config, "FEATURE_NOTIFICATIONS", True)
    notes = client.get("/api/notifications", headers=tech_headers).json()
    ticket_id = r.json()["id"]
    assert not any(n["ticket_id"] == ticket_id for n in notes)


# ─── Recurring invoicing ──────────────────────────────────────────────────────

RECURRING_INVOICE_BASE = {
    "name": "Toggle Retainer", "interval": "monthly", "client_name": "Acme",
    "client_email": "acme@example.com", "client_address": "", "tax_rate": 0,
    "notes": "", "auto_send": False, "lines": [{"description": "Retainer", "qty": 1, "unit_price": 500}],
}


def test_recurring_invoices_endpoints_503_when_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_RECURRING_INVOICING", False)
    assert client.get("/api/recurring-invoices", headers=admin_headers).status_code == 503
    assert client.post("/api/recurring-invoices", json=RECURRING_INVOICE_BASE, headers=admin_headers).status_code == 503
    assert client.get("/api/recurring-invoices/1", headers=admin_headers).status_code == 503
    assert client.put("/api/recurring-invoices/1", json=RECURRING_INVOICE_BASE, headers=admin_headers).status_code == 503
    assert client.delete("/api/recurring-invoices/1", headers=admin_headers).status_code == 503


# ─── Scheduling ───────────────────────────────────────────────────────────────

def test_appointments_endpoints_503_when_disabled(client, admin_headers, tech_headers, ticket_id, monkeypatch):
    tech_id = client.get("/api/auth/me", headers=tech_headers).json()["id"]
    monkeypatch.setattr(config, "FEATURE_SCHEDULING", False)

    assert client.get(
        "/api/appointments",
        params={"start": "2026-01-01T00:00:00Z", "end": "2026-01-02T00:00:00Z"},
        headers=admin_headers,
    ).status_code == 503
    assert client.post("/api/appointments", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-01T09:00:00Z", "end_at": "2026-08-01T10:00:00Z",
    }, headers=admin_headers).status_code == 503
    assert client.put("/api/appointments/1", json={
        "ticket_id": ticket_id, "technician_id": tech_id,
        "start_at": "2026-08-01T09:00:00Z", "end_at": "2026-08-01T10:00:00Z",
    }, headers=admin_headers).status_code == 503
    assert client.delete("/api/appointments/1", headers=admin_headers).status_code == 503


def test_has_appointment_filter_ignored_when_scheduling_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_SCHEDULING", False)
    r = client.get("/api/tickets", params={"has_appointment": "true", "page_size": 5}, headers=admin_headers)
    assert r.status_code == 200  # param ignored, not a hard error
