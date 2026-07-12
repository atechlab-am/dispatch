"""Tests for POST /api/leads/bulk-update and /api/leads/bulk-delete."""


def _make_lead(client, admin_headers, business_name):
    r = client.post("/api/leads", json={"business_name": business_name}, headers=admin_headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_bulk_update_priority_and_stage(client, admin_headers):
    l1 = _make_lead(client, admin_headers, "Bulk One Co")
    l2 = _make_lead(client, admin_headers, "Bulk Two Co")
    r = client.post(
        "/api/leads/bulk-update",
        json={"lead_ids": [l1["id"], l2["id"]], "priority": "high", "stage": "contacted"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["updated"] == 2

    updated1 = client.get(f"/api/leads/{l1['id']}", headers=admin_headers).json()
    assert updated1["priority"] == "high"
    assert updated1["stage"] == "contacted"


def test_bulk_update_logs_stage_change_activity(client, admin_headers):
    lead = _make_lead(client, admin_headers, "Bulk Activity Co")
    client.post(
        "/api/leads/bulk-update",
        json={"lead_ids": [lead["id"]], "stage": "qualified"},
        headers=admin_headers,
    )
    activities = client.get(f"/api/leads/{lead['id']}/activities", headers=admin_headers).json()
    assert any(a["type"] == "stage_change" and "bulk update" in a["body"] for a in activities)


def test_bulk_update_other_fields(client, admin_headers):
    lead = _make_lead(client, admin_headers, "Bulk Fields Co")
    r = client.post(
        "/api/leads/bulk-update",
        json={
            "lead_ids": [lead["id"]],
            "outreach_channel": "email",
            "date_contacted": "2026-06-01",
            "follow_up_date": "2026-06-15",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200
    updated = client.get(f"/api/leads/{lead['id']}", headers=admin_headers).json()
    assert updated["outreach_channel"] == "email"
    assert updated["date_contacted"] == "2026-06-01"
    assert updated["follow_up_date"] == "2026-06-15"


def test_bulk_update_stage_lost_rejected(client, admin_headers):
    lead = _make_lead(client, admin_headers, "Bulk Lost Rejected Co")
    r = client.post(
        "/api/leads/bulk-update",
        json={"lead_ids": [lead["id"]], "stage": "lost"},
        headers=admin_headers,
    )
    assert r.status_code == 422


def test_bulk_update_empty_ids_rejected(client, admin_headers):
    r = client.post("/api/leads/bulk-update", json={"lead_ids": [], "priority": "high"}, headers=admin_headers)
    assert r.status_code == 422


def test_bulk_delete_empty_ids_rejected(client, admin_headers):
    r = client.post("/api/leads/bulk-delete", json={"lead_ids": []}, headers=admin_headers)
    assert r.status_code == 422


def test_bulk_delete_removes_leads(client, admin_headers):
    l1 = _make_lead(client, admin_headers, "Bulk Delete One Co")
    l2 = _make_lead(client, admin_headers, "Bulk Delete Two Co")
    r = client.post("/api/leads/bulk-delete", json={"lead_ids": [l1["id"], l2["id"]]}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["updated"] == 2
    assert client.get(f"/api/leads/{l1['id']}", headers=admin_headers).status_code == 404
    assert client.get(f"/api/leads/{l2['id']}", headers=admin_headers).status_code == 404


def test_bulk_update_nonexistent_ids_returns_zero(client, admin_headers):
    r = client.post("/api/leads/bulk-update", json={"lead_ids": [999999], "priority": "high"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["updated"] == 0
