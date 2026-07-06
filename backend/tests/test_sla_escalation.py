"""Tests for the SLA-breach escalation background check.

Unlike the toggles for request/response endpoints, FEATURE_SLA_ESCALATION only
gates whether main.py's lifespan starts the background loop (see
test_config_toggles.py for the /api/config reflection of this flag) — there is
no endpoint to 503 here, so that's covered separately rather than duplicated
in this file.
"""
from datetime import datetime, timezone

TICKET_BASE = {
    "status": "Open", "priority": "Urgent", "client_type": "business",
    "client_name": "Breach Co", "client_email": "breach@example.com",
    "client_phone": "", "client_address": "", "title": "Server down",
    "description": "", "internal_notes": "", "travel_fee": "travel_none",
    "service_lines": [], "hour_logs": [],
}

PAST = datetime(2020, 1, 1, tzinfo=timezone.utc)


def _force_breach(ticket_id, assigned_to=None):
    from app import database as _db_module
    from app.models.models import Ticket
    db = _db_module.SessionLocal()
    try:
        t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        t.sla_response_due = PAST
        t.sla_resolution_due = PAST
        if assigned_to is not None:
            t.assigned_to = assigned_to
        db.commit()
    finally:
        db.close()


def test_breached_ticket_notifies_assignee(client, admin_headers, tech_headers):
    tech_me = client.get("/api/auth/me", headers=tech_headers).json()
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_me["id"]}, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid, assigned_to=tech_me["id"])

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "sla_breach" and n["ticket_id"] == tid for n in notes)


def test_breached_unassigned_ticket_notifies_admins(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid)

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()

    notes = client.get("/api/notifications", headers=admin_headers).json()
    assert any(n["kind"] == "sla_breach" and n["ticket_id"] == tid for n in notes)


def test_breach_only_notifies_once(client, admin_headers, tech_headers):
    tech_me = client.get("/api/auth/me", headers=tech_headers).json()
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_me["id"]}, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid, assigned_to=tech_me["id"])

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()
    _check_sla_breaches()  # second run must be a no-op for this ticket

    notes = client.get("/api/notifications", headers=tech_headers).json()
    matches = [n for n in notes if n["kind"] == "sla_breach" and n["ticket_id"] == tid]
    assert len(matches) == 1


def test_paused_ticket_is_not_flagged(client, admin_headers, tech_headers):
    tech_me = client.get("/api/auth/me", headers=tech_headers).json()
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_me["id"]}, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid, assigned_to=tech_me["id"])

    from app import database as _db_module
    from app.models.models import Ticket
    db = _db_module.SessionLocal()
    try:
        t = db.query(Ticket).filter(Ticket.id == tid).first()
        t.sla_paused_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert not any(n["kind"] == "sla_breach" and n["ticket_id"] == tid for n in notes)


def test_resolved_ticket_is_not_flagged(client, admin_headers, tech_headers):
    tech_me = client.get("/api/auth/me", headers=tech_headers).json()
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_me["id"]}, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid, assigned_to=tech_me["id"])

    from app import database as _db_module
    from app.models.models import Ticket
    db = _db_module.SessionLocal()
    try:
        t = db.query(Ticket).filter(Ticket.id == tid).first()
        t.status = "Resolved"
        db.commit()
    finally:
        db.close()

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert not any(n["kind"] == "sla_breach" and n["ticket_id"] == tid for n in notes)


def test_reopening_ticket_clears_notified_guard(client, admin_headers, tech_headers):
    tech_me = client.get("/api/auth/me", headers=tech_headers).json()
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_me["id"]}, headers=admin_headers)
    tid = r.json()["id"]
    _force_breach(tid, assigned_to=tech_me["id"])

    from app.tasks import _check_sla_breaches
    _check_sla_breaches()

    full = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    full["status"] = "Resolved"
    client.put(f"/api/tickets/{tid}", json=full, headers=admin_headers)
    full2 = client.get(f"/api/tickets/{tid}", headers=admin_headers).json()
    full2["status"] = "Open"
    client.put(f"/api/tickets/{tid}", json=full2, headers=admin_headers)

    _force_breach(tid, assigned_to=tech_me["id"])
    _check_sla_breaches()

    notes = client.get("/api/notifications", headers=tech_headers).json()
    matches = [n for n in notes if n["kind"] == "sla_breach" and n["ticket_id"] == tid]
    assert len(matches) == 2
