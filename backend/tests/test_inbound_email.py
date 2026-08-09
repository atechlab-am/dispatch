"""Tests for the email-to-ticket inbound webhook. No real Postmark calls —
just synthetic Postmark-shaped payloads posted directly at the endpoint."""
import pytest

from app import config

TICKET_BASE = {
    "status": "Open",
    "priority": "Medium",
    "client_type": "business",
    "client_name": "Inbound Client",
    "client_email": "inbound@example.com",
    "client_phone": "",
    "client_address": "",
    "title": "Ticket for inbound email",
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


def _payload(subject, message_id="msg-1", sender="jane@client.com", text="Hello, following up."):
    return {
        "From": f"Jane Doe <{sender}>",
        "FromFull": {"Email": sender, "Name": "Jane Doe"},
        "Subject": subject,
        "TextBody": text,
        "HtmlBody": f"<p>{text}</p>",
        "MessageID": message_id,
    }


def test_webhook_requires_secret_configured(client, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "")
    r = client.post("/api/inbound-email/anything", json=_payload("no tag"))
    assert r.status_code == 404


def test_webhook_rejects_wrong_secret(client, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "correct-secret")
    r = client.post("/api/inbound-email/wrong-secret", json=_payload("no tag"))
    assert r.status_code == 404


def test_webhook_threads_reply_onto_existing_ticket(client, admin_headers, ticket_id, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    r = client.post(
        "/api/inbound-email/s3cret",
        json=_payload(f"Re: [{ticket_id}] Following up", message_id="msg-thread-1", text="Any update?"),
    )
    assert r.status_code == 200

    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    matching = [c for c in comments if c["body"] == "Any update?"]
    assert len(matching) == 1
    assert matching[0]["author_id"] is None
    assert matching[0]["is_internal"] is False
    assert matching[0]["author_name"] == "Jane Doe"


def test_webhook_creates_ticket_when_no_ticket_id_in_subject(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    r = client.post(
        "/api/inbound-email/s3cret",
        json=_payload("Need help with my printer", message_id="msg-new-1", sender="newclient@example.com"),
    )
    assert r.status_code == 200

    all_tickets = client.get("/api/tickets", params={"page_size": 100}, headers=admin_headers).json()["items"]
    assert any(t["title"] == "Need help with my printer" for t in all_tickets)


def test_webhook_creates_ticket_when_tagged_ticket_not_found(client, admin_headers, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    r = client.post(
        "/api/inbound-email/s3cret",
        json=_payload("Re: [TKT-2020-99999] old ticket", message_id="msg-notfound-1"),
    )
    assert r.status_code == 200
    all_tickets = client.get("/api/tickets", params={"page_size": 100}, headers=admin_headers).json()["items"]
    assert any(t["title"] == "Re: [TKT-2020-99999] old ticket" for t in all_tickets)


def test_webhook_ignores_sender_mismatch_still_threads(client, admin_headers, ticket_id, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    # ticket_id's client_email is inbound@example.com; sender here is different
    r = client.post(
        "/api/inbound-email/s3cret",
        json=_payload(f"Re: [{ticket_id}] foo", message_id="msg-mismatch-1", sender="someoneelse@other.com", text="CC'd reply"),
    )
    assert r.status_code == 200
    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    assert any(c["body"] == "CC'd reply" for c in comments)


def test_webhook_idempotent_on_duplicate_message_id(client, admin_headers, ticket_id, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    payload = _payload(f"Re: [{ticket_id}] dup test", message_id="msg-dup-1", text="Only once please")
    r1 = client.post("/api/inbound-email/s3cret", json=payload)
    r2 = client.post("/api/inbound-email/s3cret", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200

    comments = client.get(f"/api/tickets/{ticket_id}/comments", headers=admin_headers).json()
    matching = [c for c in comments if c["body"] == "Only once please"]
    assert len(matching) == 1


def test_webhook_malformed_json_returns_400(client, monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "s3cret")
    r = client.post("/api/inbound-email/s3cret", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
