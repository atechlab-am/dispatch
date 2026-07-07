import pytest

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Comment Client",
    "client_email": "comment@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for comments",
    "description": "",
    "internal_notes": "",
    "travel_fee": "travel_none",
    "service_lines": [],
    "hour_logs": [],
}


@pytest.fixture(scope="module")
def ticket_id(client, admin_headers):
    r = client.post("/api/tickets", json=TICKET_BASE, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


@pytest.fixture(scope="module")
def comment_id(client, admin_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "First comment", "is_internal": False},
        headers=admin_headers,
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_add_comment(client, admin_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "This is a comment", "is_internal": False},
        headers=admin_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["body"] == "This is a comment"
    assert data["is_internal"] is False
    assert data["author_name"] == "Test Admin"


def test_add_internal_comment(client, admin_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Internal note", "is_internal": True},
        headers=admin_headers,
    )
    assert r.status_code == 201
    assert r.json()["is_internal"] is True


def test_list_comments(client, admin_headers, ticket_id, comment_id):
    r = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    ids = [c["id"] for c in data]
    assert comment_id in ids


def test_empty_comment_rejected(client, admin_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "", "is_internal": False},
        headers=admin_headers,
    )
    assert r.status_code == 422


def test_comment_on_missing_ticket(client, admin_headers):
    r = client.post(
        "/api/tickets/TKT-0000-00000/comments",
        json={"body": "Ghost comment", "is_internal": False},
        headers=admin_headers,
    )
    assert r.status_code == 404


def test_author_can_delete_own_comment(client, admin_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Delete me", "is_internal": False},
        headers=admin_headers,
    )
    cid = r.json()["id"]
    r = client.delete(f"/api/tickets/{ticket_id}/comments/{cid}", headers=admin_headers)
    assert r.status_code == 204
    ids = [c["id"] for c in client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()]
    assert cid not in ids


def test_technician_cannot_delete_others_comment(client, admin_headers, tech_headers, ticket_id):
    r = client.post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Admin comment", "is_internal": False},
        headers=admin_headers,
    )
    cid = r.json()["id"]
    r = client.delete(f"/api/tickets/{ticket_id}/comments/{cid}", headers=tech_headers)
    assert r.status_code == 403


def test_unauthenticated_cannot_list_comments(client, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/comments")
    assert r.status_code in (401, 403)


def _inbound_client_comment(client, ticket_id, body_text, message_id, monkeypatch):
    """Create a null-author (client-authored) comment via the inbound email
    webhook, to exercise list/delete against a real such row."""
    from app import config
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "test-inbound-secret")
    r = client.post(
        "/api/inbound-email/test-inbound-secret",
        json={
            "From": "Jane Client <jane@client.com>",
            "FromFull": {"Email": "jane@client.com", "Name": "Jane Client"},
            "Subject": f"Re: [{ticket_id}] reply",
            "TextBody": body_text,
            "HtmlBody": f"<p>{body_text}</p>",
            "MessageID": message_id,
        },
    )
    assert r.status_code == 200


def test_list_comments_includes_client_authored_comment(client, admin_headers, ticket_id, monkeypatch):
    _inbound_client_comment(client, ticket_id, "outerjoin regression test", "msg-comments-1", monkeypatch)
    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    matching = [c for c in comments if c["body"] == "outerjoin regression test"]
    assert len(matching) == 1
    assert matching[0]["author_id"] is None
    assert matching[0]["author_name"] == "Jane Client"


def test_technician_cannot_delete_client_authored_comment(client, admin_headers, tech_headers, ticket_id, monkeypatch):
    _inbound_client_comment(client, ticket_id, "tech cannot delete this", "msg-comments-2", monkeypatch)
    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    cid = next(c["id"] for c in comments if c["body"] == "tech cannot delete this")

    r = client.delete(f"/api/tickets/{ticket_id}/comments/{cid}", headers=tech_headers)
    assert r.status_code == 403


def test_admin_can_delete_client_authored_comment(client, admin_headers, ticket_id, monkeypatch):
    _inbound_client_comment(client, ticket_id, "admin can delete this", "msg-comments-3", monkeypatch)
    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    cid = next(c["id"] for c in comments if c["body"] == "admin can delete this")

    r = client.delete(f"/api/tickets/{ticket_id}/comments/{cid}", headers=admin_headers)
    assert r.status_code == 204
