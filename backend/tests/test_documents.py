import io
import pytest

PDF_BYTES = b"%PDF-1.4 fake pdf content for testing"


def _upload(client, headers, name="Server Setup Guide", category="internal",
             ticket_types="Incident,Service Request", tags="networking", requires_signature=False):
    return client.post(
        "/api/documents",
        params={
            "name": name,
            "description": "Internal guide",
            "category": category,
            "ticket_types": ticket_types,
            "tags": tags,
            "requires_signature": str(requires_signature).lower(),
        },
        files={"file": ("guide.pdf", io.BytesIO(PDF_BYTES), "application/pdf")},
        headers=headers,
    )


@pytest.fixture(scope="module")
def doc_id(client, admin_headers):
    r = _upload(client, admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_upload_document(client, admin_headers):
    r = _upload(client, admin_headers, name="Unique Upload Test")
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Unique Upload Test"
    assert data["category"] == "internal"
    assert "Incident" in data["ticket_types"]
    assert "networking" in data["tags"]
    assert data["requires_signature"] is False
    assert data["original_name"] == "guide.pdf"
    assert data["size"] > 0


def test_upload_client_facing_with_signature(client, admin_headers):
    r = _upload(client, admin_headers, name="Service Agreement",
                category="client_facing", requires_signature=True)
    assert r.status_code == 201
    data = r.json()
    assert data["category"] == "client_facing"
    assert data["requires_signature"] is True


def test_upload_invalid_category(client, admin_headers):
    r = client.post(
        "/api/documents",
        params={"name": "Bad", "category": "secret"},
        files={"file": ("f.pdf", io.BytesIO(PDF_BYTES), "application/pdf")},
        headers=admin_headers,
    )
    assert r.status_code == 422


def test_upload_disallowed_mime(client, admin_headers):
    r = client.post(
        "/api/documents",
        params={"name": "Bad", "category": "internal"},
        files={"file": ("f.exe", io.BytesIO(b"MZ"), "application/x-msdownload")},
        headers=admin_headers,
    )
    assert r.status_code == 415


def test_upload_empty_file(client, admin_headers):
    r = client.post(
        "/api/documents",
        params={"name": "Empty", "category": "internal"},
        files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_list_documents(client, admin_headers, doc_id):
    r = client.get("/api/documents", headers=admin_headers)
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()]
    assert doc_id in ids


def test_list_filter_by_category(client, admin_headers):
    r = client.get("/api/documents", params={"category": "internal"}, headers=admin_headers)
    assert r.status_code == 200
    for d in r.json():
        assert d["category"] == "internal"


def test_list_filter_by_ticket_type(client, admin_headers, doc_id):
    r = client.get("/api/documents", params={"ticket_type": "Incident"}, headers=admin_headers)
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()]
    assert doc_id in ids


def test_list_filter_ticket_type_no_match(client, admin_headers):
    # upload a doc tagged only for "Change"
    r = _upload(client, admin_headers, name="Change Doc", ticket_types="Change")
    change_id = r.json()["id"]
    r = client.get("/api/documents", params={"ticket_type": "Incident"}, headers=admin_headers)
    ids = [d["id"] for d in r.json()]
    assert change_id not in ids


def test_get_document(client, admin_headers, doc_id):
    r = client.get(f"/api/documents/{doc_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["id"] == doc_id


def test_get_document_not_found(client, admin_headers):
    r = client.get("/api/documents/999999", headers=admin_headers)
    assert r.status_code == 404


def test_update_document(client, admin_headers, doc_id):
    r = client.put(f"/api/documents/{doc_id}", json={
        "name": "Updated Guide",
        "description": "Updated desc",
        "category": "internal",
        "ticket_types": ["Incident"],
        "tags": ["networking", "firewall"],
        "requires_signature": False,
    }, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Updated Guide"
    assert "firewall" in data["tags"]
    assert data["ticket_types"] == ["Incident"]


def test_technician_cannot_update_document(client, tech_headers, doc_id):
    r = client.put(f"/api/documents/{doc_id}", json={
        "name": "Hacked", "description": "", "category": "internal",
        "ticket_types": [], "tags": [], "requires_signature": False,
    }, headers=tech_headers)
    assert r.status_code == 403


def test_download_document(client, admin_headers, doc_id):
    r = client.get(f"/api/documents/{doc_id}/download", headers=admin_headers)
    assert r.status_code == 200
    assert r.content == PDF_BYTES


def test_technician_cannot_delete_document(client, tech_headers, doc_id):
    r = client.delete(f"/api/documents/{doc_id}", headers=tech_headers)
    assert r.status_code == 403


def test_delete_document(client, admin_headers):
    r = _upload(client, admin_headers, name="To Delete")
    did = r.json()["id"]
    r = client.delete(f"/api/documents/{did}", headers=admin_headers)
    assert r.status_code == 204
    r = client.get(f"/api/documents/{did}", headers=admin_headers)
    assert r.status_code == 404


def test_unauthenticated_cannot_list(client):
    r = client.get("/api/documents")
    assert r.status_code in (401, 403)
