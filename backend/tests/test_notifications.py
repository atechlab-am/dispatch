import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Notif Client",
    "client_email": "notif@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for notifications",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}


@pytest.fixture()
def tech_id(client, tech_headers):
    return client.get("/api/auth/me", headers=tech_headers).json()["id"]


def test_assignment_on_create_notifies_assignee(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    assert r.status_code == 201
    ticket_id = r.json()["id"]

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "assigned" and n["ticket_id"] == ticket_id for n in notes)


def test_reassignment_without_status_change_notifies(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    ticket_id = r.json()["id"]

    body = {**TICKET_BASE, "assigned_to": tech_id}  # status unchanged (Open -> Open)
    r = client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)
    assert r.status_code == 200

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "reassigned" and n["ticket_id"] == ticket_id for n in notes)


def test_status_change_notifies_assignee(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    ticket_id = r.json()["id"]

    body = {**TICKET_BASE, "assigned_to": tech_id, "status": "In Progress"}
    client.put(f"/api/tickets/{ticket_id}", json=body, headers=admin_headers)

    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "status_changed" and n["ticket_id"] == ticket_id for n in notes)


def test_internal_comment_notifies_assignee_but_not_self(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    ticket_id = r.json()["id"]

    # Admin (not the assignee) comments internally -> tech should be notified
    client.post(f"/api/tickets/{ticket_id}/comments", json={"body": "internal note", "is_internal": True}, headers=admin_headers)
    notes = client.get("/api/notifications", headers=tech_headers).json()
    assert any(n["kind"] == "comment_added" and n["ticket_id"] == ticket_id for n in notes)

    # Tech comments on their own assigned ticket -> should not notify themselves
    before = len(client.get("/api/notifications", headers=tech_headers).json())
    client.post(f"/api/tickets/{ticket_id}/comments", json={"body": "self note", "is_internal": True}, headers=tech_headers)
    after = client.get("/api/notifications", headers=tech_headers).json()
    assert len(after) == before


def test_notifications_scoped_per_user(client, admin_headers, tech_headers, admin_id=None):
    admin_id = client.get("/api/auth/me", headers=admin_headers).json()["id"]
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": admin_id}, headers=admin_headers)
    ticket_id = r.json()["id"]

    tech_notes = client.get("/api/notifications", headers=tech_headers).json()
    assert not any(n["ticket_id"] == ticket_id for n in tech_notes)


def test_mark_read_on_others_notification_404s(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    ticket_id = r.json()["id"]
    notes = client.get("/api/notifications", headers=tech_headers).json()
    note_id = next(n["id"] for n in notes if n["ticket_id"] == ticket_id)

    r = client.post(f"/api/notifications/{note_id}/read", headers=admin_headers)
    assert r.status_code == 404


def test_mark_read_and_unread_count(client, admin_headers, tech_headers, tech_id):
    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    ticket_id = r.json()["id"]

    before = client.get("/api/notifications/unread-count", headers=tech_headers).json()["count"]
    assert before > 0

    notes = client.get("/api/notifications", headers=tech_headers).json()
    note_id = next(n["id"] for n in notes if n["ticket_id"] == ticket_id)
    r = client.post(f"/api/notifications/{note_id}/read", headers=tech_headers)
    assert r.status_code == 200
    assert r.json()["read"] is True

    after = client.get("/api/notifications/unread-count", headers=tech_headers).json()["count"]
    assert after == before - 1


def test_mark_all_read(client, admin_headers, tech_headers, tech_id):
    client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    r = client.post("/api/notifications/read-all", headers=tech_headers)
    assert r.status_code == 204
    count = client.get("/api/notifications/unread-count", headers=tech_headers).json()["count"]
    assert count == 0


def test_unauthenticated_cannot_list_notifications(client):
    r = client.get("/api/notifications")
    assert r.status_code in (401, 403)


def test_purge_deletes_old_read_notifications_only(client, admin_headers, tech_headers, tech_id):
    from datetime import datetime, timedelta, timezone
    from app.main import _purge_old_notifications_once
    from app.models.models import Notification
    import app.database as _db_module

    r = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id}, headers=admin_headers)
    ticket_id = r.json()["id"]
    notes = client.get("/api/notifications", headers=tech_headers).json()
    old_read_id = next(n["id"] for n in notes if n["ticket_id"] == ticket_id)
    client.post(f"/api/notifications/{old_read_id}/read", headers=tech_headers)

    r2 = client.post("/api/tickets", json={**TICKET_BASE, "assigned_to": tech_id, "title": "Second"}, headers=admin_headers)
    ticket_id_2 = r2.json()["id"]
    notes2 = client.get("/api/notifications", headers=tech_headers).json()
    recent_unread_id = next(n["id"] for n in notes2 if n["ticket_id"] == ticket_id_2)

    db = _db_module.SessionLocal()
    try:
        old = db.query(Notification).filter(Notification.id == old_read_id).first()
        old.created_at = datetime.now(timezone.utc) - timedelta(days=91)
        db.commit()

        deleted = _purge_old_notifications_once(db)
        assert deleted >= 1

        assert db.query(Notification).filter(Notification.id == old_read_id).first() is None
        assert db.query(Notification).filter(Notification.id == recent_unread_id).first() is not None
    finally:
        db.close()
