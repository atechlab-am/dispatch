"""Tests for per-client SLA tiers (gold/silver/bronze override of the global
per-priority SLA table)."""
from datetime import datetime, timezone

from app import config

CLIENT_BASE = {
    "name": "Tier Corp", "email": "tier@example.com", "phone": "",
    "address": "", "client_type": "business", "company": "Tier Corp", "notes": "",
}

TICKET_BASE = {
    "status": "Open", "priority": "Medium", "client_type": "business",
    "client_name": "Tier Corp", "client_email": "tier@example.com",
    "client_phone": "", "client_address": "", "title": "Tiered ticket",
    "description": "", "internal_notes": "", "travel_fee": "travel_none",
    "service_lines": [], "hour_logs": [],
}


def _create_client(client, admin_headers, tier=None):
    body = {**CLIENT_BASE}
    if tier is not None:
        body["sla_tier"] = tier
    r = client.post("/api/clients", json=body, headers=admin_headers)
    assert r.status_code == 201
    return r.json()


def test_create_client_with_gold_tier(client, admin_headers):
    c = _create_client(client, admin_headers, "gold")
    assert c["sla_tier"] == "gold"


def test_create_client_with_no_tier_defaults_to_null(client, admin_headers):
    c = _create_client(client, admin_headers)
    assert c["sla_tier"] is None


def test_invalid_tier_rejected(client, admin_headers):
    r = client.post("/api/clients", json={**CLIENT_BASE, "sla_tier": "platinum"}, headers=admin_headers)
    assert r.status_code == 422


def test_update_client_tier(client, admin_headers):
    c = _create_client(client, admin_headers, "silver")
    r = client.put(f"/api/clients/{c['id']}", json={**CLIENT_BASE, "sla_tier": "bronze"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["sla_tier"] == "bronze"


def test_gold_tier_tightens_urgent_sla(client, admin_headers):
    """Gold halves the hours (0.5x); Urgent uses raw wall-clock hours, so this
    is deterministic regardless of business-hours skipping."""
    gold = _create_client(client, admin_headers, "gold")
    plain = _create_client(client, admin_headers)

    r1 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": gold["id"]}, headers=admin_headers)
    r2 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": plain["id"]}, headers=admin_headers)

    gold_due = datetime.fromisoformat(r1.json()["sla_response_due"].replace("Z", "+00:00"))
    plain_due = datetime.fromisoformat(r2.json()["sla_response_due"].replace("Z", "+00:00"))
    assert gold_due < plain_due


def test_bronze_tier_loosens_urgent_sla(client, admin_headers):
    bronze = _create_client(client, admin_headers, "bronze")
    plain = _create_client(client, admin_headers)

    r1 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": bronze["id"]}, headers=admin_headers)
    r2 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": plain["id"]}, headers=admin_headers)

    bronze_due = datetime.fromisoformat(r1.json()["sla_response_due"].replace("Z", "+00:00"))
    plain_due = datetime.fromisoformat(r2.json()["sla_response_due"].replace("Z", "+00:00"))
    assert bronze_due > plain_due


def test_silver_tier_matches_global_default(client, admin_headers):
    silver = _create_client(client, admin_headers, "silver")
    plain = _create_client(client, admin_headers)

    r1 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": silver["id"]}, headers=admin_headers)
    r2 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": plain["id"]}, headers=admin_headers)

    created1 = datetime.fromisoformat(r1.json()["created_at"].replace("Z", "+00:00"))
    due1 = datetime.fromisoformat(r1.json()["sla_response_due"].replace("Z", "+00:00"))
    created2 = datetime.fromisoformat(r2.json()["created_at"].replace("Z", "+00:00"))
    due2 = datetime.fromisoformat(r2.json()["sla_response_due"].replace("Z", "+00:00"))
    # Both should be exactly 1 hour (Urgent's raw response_h) after their own creation —
    # comparing deltas rather than absolute timestamps avoids flakiness from the two
    # requests landing at slightly different `now()` values.
    assert abs((due1 - created1) - (due2 - created2)).total_seconds() < 1


def test_tier_ignored_when_feature_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_SLA_TIERS", False)
    try:
        gold = _create_client(client, admin_headers, None)  # tier field itself is nulled while disabled at creation
        # Force a tier directly in the DB to simulate a pre-existing tiered client
        from app import database as _db_module
        from app.models.models import Client
        db = _db_module.SessionLocal()
        try:
            c = db.query(Client).filter(Client.id == gold["id"]).first()
            c.sla_tier = "gold"
            db.commit()
        finally:
            db.close()

        plain = _create_client(client, admin_headers)
        r1 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": gold["id"]}, headers=admin_headers)
        r2 = client.post("/api/tickets", json={**TICKET_BASE, "priority": "Urgent", "client_id": plain["id"]}, headers=admin_headers)

        created1 = datetime.fromisoformat(r1.json()["created_at"].replace("Z", "+00:00"))
        due1 = datetime.fromisoformat(r1.json()["sla_response_due"].replace("Z", "+00:00"))
        created2 = datetime.fromisoformat(r2.json()["created_at"].replace("Z", "+00:00"))
        due2 = datetime.fromisoformat(r2.json()["sla_response_due"].replace("Z", "+00:00"))
        assert abs((due1 - created1) - (due2 - created2)).total_seconds() < 1
    finally:
        monkeypatch.setattr(config, "FEATURE_SLA_TIERS", True)


def test_client_sla_tier_field_nulled_on_create_when_disabled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "FEATURE_SLA_TIERS", False)
    try:
        c = _create_client(client, admin_headers, "gold")
        assert c["sla_tier"] is None
    finally:
        monkeypatch.setattr(config, "FEATURE_SLA_TIERS", True)
