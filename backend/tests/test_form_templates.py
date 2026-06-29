"""Tests for form templates and form instances."""
import pytest


FIELDS = [
    {"id": "client_name", "label": "Client Name", "type": "text", "required": True, "placeholder": ""},
    {"id": "scope",       "label": "Scope of Work", "type": "textarea", "required": True, "placeholder": "Describe the work"},
    {"id": "start_date",  "label": "Start Date", "type": "date", "required": False, "placeholder": ""},
    {"id": "approved",    "label": "Client Approved", "type": "checkbox", "required": False, "placeholder": ""},
]


# ─── Template CRUD ────────────────────────────────────────────────────────────

def test_create_template_admin(client, admin_headers):
    r = client.post("/api/form-templates", json={
        "name": "Scope of Work",
        "description": "Standard SOW form",
        "ticket_types": ["Incident", "Request"],
        "fields": FIELDS,
    }, headers=admin_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Scope of Work"
    assert len(data["fields"]) == 4
    assert data["ticket_types"] == ["Incident", "Request"]


def test_create_template_tech_forbidden(client, tech_headers):
    r = client.post("/api/form-templates", json={
        "name": "Should Fail",
        "fields": [],
    }, headers=tech_headers)
    assert r.status_code == 403


def test_create_template_requires_auth(client):
    r = client.post("/api/form-templates", json={"name": "No Auth", "fields": []})
    assert r.status_code in (401, 403)


def test_list_templates(client, admin_headers):
    r = client.get("/api/form-templates", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert any(t["name"] == "Scope of Work" for t in r.json())


def test_list_templates_ticket_type_filter(client, admin_headers):
    r = client.get("/api/form-templates", params={"ticket_type": "Incident"}, headers=admin_headers)
    assert r.status_code == 200
    for t in r.json():
        types = t["ticket_types"]
        assert len(types) == 0 or "Incident" in types


def test_get_template(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    r = client.get(f"/api/form-templates/{tmpl_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["id"] == tmpl_id


def test_get_template_not_found(client, admin_headers):
    r = client.get("/api/form-templates/999999", headers=admin_headers)
    assert r.status_code == 404


def test_update_template(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    r = client.put(f"/api/form-templates/{tmpl_id}", json={
        "name": "Scope of Work Updated",
        "description": "Updated",
        "ticket_types": ["Change Request"],
        "fields": FIELDS[:2],
    }, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Scope of Work Updated"
    assert len(r.json()["fields"]) == 2


def test_update_template_duplicate_field_ids(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    dup_fields = [
        {"id": "same", "label": "A", "type": "text", "required": False, "placeholder": ""},
        {"id": "same", "label": "B", "type": "text", "required": False, "placeholder": ""},
    ]
    r = client.put(f"/api/form-templates/{tmpl_id}", json={
        "name": "X", "description": "", "ticket_types": [], "fields": dup_fields,
    }, headers=admin_headers)
    assert r.status_code == 422


def test_delete_template(client, admin_headers):
    r = client.post("/api/form-templates", json={"name": "To Delete", "fields": []}, headers=admin_headers)
    tmpl_id = r.json()["id"]
    r2 = client.delete(f"/api/form-templates/{tmpl_id}", headers=admin_headers)
    assert r2.status_code == 204
    assert client.get(f"/api/form-templates/{tmpl_id}", headers=admin_headers).status_code == 404


# ─── Form instances ───────────────────────────────────────────────────────────

def _ensure_template(client, headers):
    r = client.get("/api/form-templates", headers=headers)
    for t in r.json():
        if t["name"] in ("Scope of Work", "Scope of Work Updated"):
            return t["id"]
    r2 = client.post("/api/form-templates", json={"name": "Scope of Work", "fields": FIELDS}, headers=headers)
    return r2.json()["id"]


def _ensure_ticket(client, headers):
    r = client.get("/api/tickets", headers=headers)
    tickets = r.json().get("tickets", [])
    if tickets:
        return tickets[0]["id"]
    r2 = client.post("/api/tickets", json={
        "ticketType": "Incident", "status": "Open", "priority": "Medium",
        "clientType": "business", "clientName": "Form Test Client",
        "clientEmail": "", "clientPhone": "", "clientAddress": "",
        "title": "Form test ticket", "description": "",
        "internalNotes": "", "travelFee": "travel_none",
        "serviceLines": [], "hourLogs": [],
    }, headers=headers)
    return r2.json()["id"]


def test_create_instance(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    ticket_id = _ensure_ticket(client, admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/form-instances", json={
        "template_id": tmpl_id,
        "values": {"client_name": "Acme Corp", "scope": "Install network", "approved": True},
    }, headers=admin_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["ticket_id"] == ticket_id
    assert data["template_id"] == tmpl_id
    assert data["values"]["client_name"] == "Acme Corp"
    assert data["template_name"] != ""
    assert len(data["fields"]) > 0


def test_list_instances(client, admin_headers):
    ticket_id = _ensure_ticket(client, admin_headers)
    r = client.get(f"/api/tickets/{ticket_id}/form-instances", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_instances_ticket_not_found(client, admin_headers):
    r = client.get("/api/tickets/TKT-9999-99999/form-instances", headers=admin_headers)
    assert r.status_code == 404


def test_get_instance(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    ticket_id = _ensure_ticket(client, admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/form-instances", json={
        "template_id": tmpl_id, "values": {},
    }, headers=admin_headers)
    inst_id = r.json()["id"]
    r2 = client.get(f"/api/form-instances/{inst_id}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == inst_id


def test_update_instance(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    ticket_id = _ensure_ticket(client, admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/form-instances", json={
        "template_id": tmpl_id, "values": {"client_name": "Old"},
    }, headers=admin_headers)
    inst_id = r.json()["id"]
    r2 = client.put(f"/api/form-instances/{inst_id}", json={"client_name": "New", "scope": "Updated scope"}, headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["values"]["client_name"] == "New"


def test_delete_instance(client, admin_headers):
    tmpl_id = _ensure_template(client, admin_headers)
    ticket_id = _ensure_ticket(client, admin_headers)
    r = client.post(f"/api/tickets/{ticket_id}/form-instances", json={
        "template_id": tmpl_id, "values": {},
    }, headers=admin_headers)
    inst_id = r.json()["id"]
    r2 = client.delete(f"/api/form-instances/{inst_id}", headers=admin_headers)
    assert r2.status_code == 204
    assert client.get(f"/api/form-instances/{inst_id}", headers=admin_headers).status_code == 404


def test_instance_requires_auth(client):
    r = client.get("/api/form-instances/1")
    assert r.status_code in (401, 403)
