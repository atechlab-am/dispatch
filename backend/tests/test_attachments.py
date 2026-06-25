"""Tests for ticket attachments (upload, list, download, delete)."""
import io
import pytest


@pytest.fixture(scope="module")
def ticket_id(client, admin_headers):
    r = client.post("/api/tickets", headers=admin_headers, json={
        "title": "Attach test", "client_name": "Bob", "priority": "Low",
        "ticket_type": "Incident", "status": "Open", "client_type": "business",
    })
    assert r.status_code == 201
    return r.json()["id"]


def _upload(client, headers, ticket_id, content=b"hello", filename="test.txt", mime="text/plain"):
    return client.post(
        f"/api/tickets/{ticket_id}/attachments",
        headers=headers,
        files={"file": (filename, io.BytesIO(content), mime)},
    )


def test_upload_attachment(client, admin_headers, ticket_id):
    r = _upload(client, admin_headers, ticket_id)
    assert r.status_code == 201
    data = r.json()
    assert data["ticket_id"] == ticket_id
    assert data["original_name"] == "test.txt"
    assert data["mime_type"] == "text/plain"
    assert data["size"] == 5


def test_list_attachments(client, admin_headers, ticket_id):
    r = client.get(f"/api/tickets/{ticket_id}/attachments", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert items[0]["ticket_id"] == ticket_id


def test_download_attachment(client, admin_headers, ticket_id):
    # Upload a fresh file and then download it
    r = _upload(client, admin_headers, ticket_id, content=b"download me", filename="dl.txt")
    assert r.status_code == 201
    att_id = r.json()["id"]

    r2 = client.get(f"/api/attachments/{att_id}/download", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.content == b"download me"


def test_delete_attachment_own(client, admin_headers, ticket_id):
    r = _upload(client, admin_headers, ticket_id, content=b"del me", filename="del.txt")
    assert r.status_code == 201
    att_id = r.json()["id"]

    r2 = client.delete(f"/api/attachments/{att_id}", headers=admin_headers)
    assert r2.status_code == 204

    r3 = client.get(f"/api/attachments/{att_id}/download", headers=admin_headers)
    assert r3.status_code == 404


def test_technician_cannot_delete_others_attachment(client, admin_headers, tech_headers, ticket_id):
    r = _upload(client, admin_headers, ticket_id, content=b"protected", filename="prot.txt")
    assert r.status_code == 201
    att_id = r.json()["id"]

    r2 = client.delete(f"/api/attachments/{att_id}", headers=tech_headers)
    assert r2.status_code == 403


def test_disallowed_file_type_rejected(client, admin_headers, ticket_id):
    r = _upload(client, admin_headers, ticket_id, content=b"bad", filename="bad.exe", mime="application/x-msdownload")
    assert r.status_code == 415


def test_empty_file_rejected(client, admin_headers, ticket_id):
    r = _upload(client, admin_headers, ticket_id, content=b"", filename="empty.txt")
    assert r.status_code == 400


def test_attachment_on_nonexistent_ticket(client, admin_headers):
    r = _upload(client, admin_headers, "TKT-9999-99999")
    assert r.status_code == 404


def test_unauthenticated_cannot_upload(client, ticket_id):
    r = _upload(client, {}, ticket_id)
    assert r.status_code in (401, 403)
