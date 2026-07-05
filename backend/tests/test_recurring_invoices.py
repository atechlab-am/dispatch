"""Tests for recurring/retainer invoice schedules."""
from datetime import datetime, timezone

from app import email as mail

RECURRING_INVOICE_BASE = {
    "name": "Acme Monthly Retainer",
    "interval": "monthly",
    "client_name": "Acme Corp",
    "client_email": "billing@acme.example.com",
    "client_address": "",
    "tax_rate": 0,
    "notes": "",
    "auto_send": False,
    "lines": [
        {"description": "Managed Services Retainer — {month}", "qty": 1, "unit_price": 500},
    ],
}


def test_create_recurring_invoice(client, admin_headers):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json=RECURRING_INVOICE_BASE)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Acme Monthly Retainer"
    assert data["auto_send"] is False
    assert len(data["lines"]) == 1
    assert "next_run" in data


def test_technician_cannot_create_recurring_invoice(client, tech_headers):
    r = client.post("/api/recurring-invoices", headers=tech_headers, json=RECURRING_INVOICE_BASE)
    assert r.status_code == 403


def test_list_recurring_invoices(client, admin_headers):
    client.post("/api/recurring-invoices", headers=admin_headers, json=RECURRING_INVOICE_BASE)
    r = client.get("/api/recurring-invoices", headers=admin_headers)
    assert r.status_code == 200
    assert any(item["name"] == "Acme Monthly Retainer" for item in r.json())


def test_get_recurring_invoice(client, admin_headers):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json={**RECURRING_INVOICE_BASE, "name": "Get Me"})
    rid = r.json()["id"]
    r2 = client.get(f"/api/recurring-invoices/{rid}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["name"] == "Get Me"


def test_update_recurring_invoice_replaces_lines(client, admin_headers):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json={**RECURRING_INVOICE_BASE, "name": "To Update"})
    rid = r.json()["id"]

    r2 = client.put(f"/api/recurring-invoices/{rid}", headers=admin_headers, json={
        **RECURRING_INVOICE_BASE, "name": "Updated", "auto_send": True,
        "lines": [{"description": "New line", "qty": 2, "unit_price": 100}],
    })
    assert r2.status_code == 200
    data = r2.json()
    assert data["name"] == "Updated"
    assert data["auto_send"] is True
    assert len(data["lines"]) == 1
    assert data["lines"][0]["description"] == "New line"


def test_delete_recurring_invoice(client, admin_headers):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json={**RECURRING_INVOICE_BASE, "name": "To Delete"})
    rid = r.json()["id"]
    r2 = client.delete(f"/api/recurring-invoices/{rid}", headers=admin_headers)
    assert r2.status_code == 204
    r3 = client.get(f"/api/recurring-invoices/{rid}", headers=admin_headers)
    assert r3.status_code == 404


def test_technician_cannot_delete_recurring_invoice(client, tech_headers, admin_headers):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json={**RECURRING_INVOICE_BASE, "name": "Tech Cannot Delete"})
    rid = r.json()["id"]
    r2 = client.delete(f"/api/recurring-invoices/{rid}", headers=tech_headers)
    assert r2.status_code == 403


def test_unauthenticated_cannot_list(client):
    r = client.get("/api/recurring-invoices")
    assert r.status_code in (401, 403)


def _make_due_schedule(client, admin_headers, **overrides):
    r = client.post("/api/recurring-invoices", headers=admin_headers, json={**RECURRING_INVOICE_BASE, **overrides})
    rid = r.json()["id"]

    from app import database as _db_module
    from app.models.models import RecurringInvoice
    db = _db_module.SessionLocal()
    try:
        row = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
        row.next_run = datetime(2020, 1, 1, tzinfo=timezone.utc)  # force due
        db.commit()
    finally:
        db.close()
    return rid


def test_fire_due_recurring_invoices_creates_invoice_and_advances_next_run(client, admin_headers):
    from app.tasks import _fire_due_recurring_invoices
    from app import database as _db_module
    from app.models.models import RecurringInvoice, AuditLog

    rid = _make_due_schedule(client, admin_headers, name="Fire Test 1")
    _fire_due_recurring_invoices()

    db = _db_module.SessionLocal()
    try:
        row = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
        assert row.last_invoice_id is not None
        assert row.next_run > datetime(2020, 1, 2)
        last_invoice_id = row.last_invoice_id

        audit_row = db.query(AuditLog).filter(AuditLog.invoice_id == last_invoice_id).first()
        assert audit_row is not None
        assert audit_row.actor_label == "System (recurring)"
    finally:
        db.close()

    inv = client.get(f"/api/invoices/{last_invoice_id}", headers=admin_headers).json()
    assert inv["status"] == "Draft"
    assert len(inv["lines"]) == 1
    assert "Managed Services Retainer" in inv["lines"][0]["description"]
    assert "{month}" not in inv["lines"][0]["description"]


def test_fire_due_recurring_invoices_respects_auto_send_off(client, admin_headers, monkeypatch):
    from app.tasks import _fire_due_recurring_invoices

    sent = []
    monkeypatch.setattr(mail, "_send", lambda to, subject, html: sent.append(to))

    rid = _make_due_schedule(client, admin_headers, name="No Auto Send", auto_send=False)
    _fire_due_recurring_invoices()

    assert sent == []


def test_fire_due_recurring_invoices_auto_send_sends_and_marks_sent(client, admin_headers, monkeypatch):
    from app.tasks import _fire_due_recurring_invoices
    from app import database as _db_module
    from app.models.models import RecurringInvoice

    sent = []
    monkeypatch.setattr(mail, "_send", lambda to, subject, html: sent.append(to))

    rid = _make_due_schedule(client, admin_headers, name="Auto Send On", auto_send=True)
    _fire_due_recurring_invoices()

    assert sent == ["billing@acme.example.com"]

    db = _db_module.SessionLocal()
    try:
        row = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
        last_invoice_id = row.last_invoice_id
    finally:
        db.close()

    inv = client.get(f"/api/invoices/{last_invoice_id}", headers=admin_headers).json()
    assert inv["status"] == "Sent"


def test_send_invoice_endpoint_still_works_after_refactor(client, admin_headers):
    r = client.post("/api/invoices", json={
        "client_name": "Refactor Check", "client_email": "refactor@example.com", "client_address": "",
        "status": "Draft", "issue_date": "2026-07-01", "due_date": "2026-07-31", "notes": "", "tax_rate": 0,
        "lines": [{"description": "Line", "qty": 1, "unit_price": 50, "amount": 50}],
    }, headers=admin_headers)
    inv_id = r.json()["id"]

    r2 = client.post(f"/api/invoices/{inv_id}/send", json={"to": "refactor@example.com", "message": ""}, headers=admin_headers)
    assert r2.status_code == 204

    inv = client.get(f"/api/invoices/{inv_id}", headers=admin_headers).json()
    assert inv["status"] == "Sent"
