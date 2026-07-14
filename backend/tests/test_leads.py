"""Tests for the Leads pipeline: CRUD, stage transitions, and conversion to Client."""

LEAD_BASE = {
    "business_name": "Acme Plumbing",
    "industry": "Plumbing",
    "area": "Downtown",
    "address": "123 Main St",
    "phone": "555-0100",
    "website": "acmeplumbing.com",
    "contact_name": "Jane Doe",
    "contact_email": "jane@acmeplumbing.com",
    "contact_phone": "555-0101",
    "notes": "Referred by a past client",
}


def _make_lead(client, admin_headers, **overrides):
    body = {**LEAD_BASE, **overrides}
    r = client.post("/api/leads", json=body, headers=admin_headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_lead_defaults(client, admin_headers):
    lead = _make_lead(client, admin_headers)
    assert lead["business_name"] == "Acme Plumbing"
    assert lead["title"] == "Acme Plumbing"  # defaults to business_name when blank
    assert lead["stage"] == "new"
    assert lead["source"] == "other"
    assert lead["priority"] == "medium"
    assert lead["converted_client_id"] is None


def test_create_lead_requires_business_name_key(client, admin_headers):
    r = client.post("/api/leads", json={}, headers=admin_headers)
    assert r.status_code == 422


def test_list_leads(client, admin_headers):
    _make_lead(client, admin_headers, business_name="List Test Co")
    r = client.get("/api/leads", headers=admin_headers)
    assert r.status_code == 200
    assert any(l["business_name"] == "List Test Co" for l in r.json())


def test_list_leads_filter_by_stage(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Stage Filter Co")
    r = client.get("/api/leads", params={"stage": "new"}, headers=admin_headers)
    assert r.status_code == 200
    assert any(l["id"] == lead["id"] for l in r.json())
    r2 = client.get("/api/leads", params={"stage": "won"}, headers=admin_headers)
    assert not any(l["id"] == lead["id"] for l in r2.json())


def test_get_lead(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Get Test Co")
    r = client.get(f"/api/leads/{lead['id']}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["business_name"] == "Get Test Co"


def test_lead_follow_up_scheduled_defaults_false(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Default Follow-up Co")
    assert lead["follow_up_scheduled"] is False


def test_lead_follow_up_scheduled_roundtrip(client, admin_headers):
    lead = _make_lead(
        client, admin_headers, business_name="Follow-up Co",
        follow_up_date="2026-08-01", follow_up_scheduled=True,
    )
    assert lead["follow_up_scheduled"] is True
    assert lead["follow_up_date"] == "2026-08-01"

    r = client.patch(f"/api/leads/{lead['id']}", json={"follow_up_scheduled": False}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["follow_up_scheduled"] is False


def test_list_leads_filter_by_follow_up_scheduled(client, admin_headers):
    scheduled = _make_lead(
        client, admin_headers, business_name="Scheduled Follow-up Co",
        follow_up_date="2026-08-01", follow_up_scheduled=True,
    )
    not_scheduled = _make_lead(client, admin_headers, business_name="Unscheduled Follow-up Co")

    r = client.get("/api/leads", params={"follow_up_scheduled": "true"}, headers=admin_headers)
    ids = {l["id"] for l in r.json()}
    assert scheduled["id"] in ids
    assert not_scheduled["id"] not in ids


def test_get_lead_404(client, admin_headers):
    r = client.get("/api/leads/999999", headers=admin_headers)
    assert r.status_code == 404


def test_update_lead_partial(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Update Test Co")
    r = client.patch(f"/api/leads/{lead['id']}", json={"priority": "high"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["priority"] == "high"
    assert r.json()["business_name"] == "Update Test Co"  # untouched fields preserved


def test_delete_lead(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Delete Test Co")
    r = client.delete(f"/api/leads/{lead['id']}", headers=admin_headers)
    assert r.status_code == 204
    r2 = client.get(f"/api/leads/{lead['id']}", headers=admin_headers)
    assert r2.status_code == 404


def test_move_stage(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Stage Move Co")
    r = client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "contacted"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["stage"] == "contacted"


def test_move_stage_to_lost_requires_reason(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Lost No Reason Co")
    r = client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "lost", "lost_reason": ""}, headers=admin_headers)
    assert r.status_code == 422


def test_move_stage_to_lost_with_reason(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Lost With Reason Co")
    r = client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "lost", "lost_reason": "Went with a competitor"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["stage"] == "lost"
    assert r.json()["lost_reason"] == "Went with a competitor"


def test_stage_change_logs_activity(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Activity Log Co")
    client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "qualified"}, headers=admin_headers)
    r = client.get(f"/api/leads/{lead['id']}/activities", headers=admin_headers)
    assert r.status_code == 200
    activities = r.json()
    assert any(a["type"] == "stage_change" and "qualified" in a["body"] for a in activities)


def test_add_manual_activity(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Manual Note Co")
    r = client.post(f"/api/leads/{lead['id']}/activities", json={"type": "call", "body": "Left a voicemail"}, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["type"] == "call"
    assert r.json()["body"] == "Left a voicemail"


def test_cannot_manually_log_stage_change_activity(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="No Manual Stage Change Co")
    r = client.post(f"/api/leads/{lead['id']}/activities", json={"type": "stage_change", "body": "hacked"}, headers=admin_headers)
    assert r.status_code == 422


def test_convert_requires_won_stage(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Not Won Yet Co")
    r = client.post(f"/api/leads/{lead['id']}/convert", headers=admin_headers)
    assert r.status_code == 400


def test_convert_won_lead_creates_client(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Convert Me Co", contact_email="convert@me.co", contact_phone="555-9999", address="1 Convert Ave")
    client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "won"}, headers=admin_headers)
    r = client.post(f"/api/leads/{lead['id']}/convert", headers=admin_headers)
    assert r.status_code == 201, r.text
    client_id = r.json()["client_id"]

    c = client.get(f"/api/clients/{client_id}", headers=admin_headers)
    assert c.status_code == 200
    assert c.json()["name"] == "Convert Me Co"
    assert c.json()["email"] == "convert@me.co"
    assert c.json()["phone"] == "555-9999"
    assert c.json()["address"] == "1 Convert Ave"

    lead_after = client.get(f"/api/leads/{lead['id']}", headers=admin_headers).json()
    assert lead_after["converted_client_id"] == client_id


def test_convert_twice_rejected(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Convert Twice Co")
    client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "won"}, headers=admin_headers)
    r1 = client.post(f"/api/leads/{lead['id']}/convert", headers=admin_headers)
    assert r1.status_code == 201
    r2 = client.post(f"/api/leads/{lead['id']}/convert", headers=admin_headers)
    assert r2.status_code == 400
