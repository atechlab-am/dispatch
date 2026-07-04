"""Tests for Phase 10 — Reporting endpoints."""
from datetime import date, timedelta


# ─── Revenue report ───────────────────────────────────────────────────────────

def test_revenue_report_shape(client, admin_headers):
    r = client.get("/api/reports/revenue", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "by_month" in data
    assert "by_client" in data
    assert "grand_total_billed" in data
    assert "grand_total_paid" in data


def test_revenue_report_totals_non_negative(client, admin_headers):
    r = client.get("/api/reports/revenue", headers=admin_headers)
    data = r.json()
    assert data["grand_total_billed"] >= 0
    assert data["grand_total_paid"] >= 0


def test_revenue_report_date_filter(client, admin_headers):
    r = client.get(
        "/api/reports/revenue",
        params={"date_from": "2020-01-01", "date_to": "2020-12-31"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    data = r.json()
    for month_row in data["by_month"]:
        assert month_row["month"] >= "2020-01"
        assert month_row["month"] <= "2020-12"


def test_revenue_report_requires_admin(client, tech_headers):
    r = client.get("/api/reports/revenue", headers=tech_headers)
    assert r.status_code in (403, 401)


def test_revenue_report_requires_auth(client):
    r = client.get("/api/reports/revenue")
    assert r.status_code in (401, 403)


def test_revenue_csv_returns_csv(client, admin_headers):
    r = client.get("/api/reports/revenue/csv", headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "revenue_report.csv" in r.headers.get("content-disposition", "")


# ─── Technician report ────────────────────────────────────────────────────────

def test_technician_report_shape(client, admin_headers):
    r = client.get("/api/reports/technician", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    for row in data["rows"]:
        assert "technician_name" in row
        assert "tickets_resolved" in row
        assert "total_hours" in row
        assert "total_labour" in row


def test_technician_report_requires_admin(client, tech_headers):
    r = client.get("/api/reports/technician", headers=tech_headers)
    assert r.status_code in (403, 401)


def test_technician_report_date_filter_accepted(client, admin_headers):
    r = client.get(
        "/api/reports/technician",
        params={"date_from": "2025-01-01", "date_to": "2025-12-31"},
        headers=admin_headers,
    )
    assert r.status_code == 200


def test_technician_csv_returns_csv(client, admin_headers):
    r = client.get("/api/reports/technician/csv", headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "technician_report.csv" in r.headers.get("content-disposition", "")


# ─── SLA report ───────────────────────────────────────────────────────────────

def test_sla_report_shape(client, admin_headers):
    r = client.get("/api/reports/sla", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    assert "overall_compliance_pct" in data
    for row in data["rows"]:
        assert "priority" in row
        assert "total" in row
        assert "within_sla" in row
        assert "breached" in row
        assert "no_sla_set" in row
        assert "compliance_pct" in row


def test_sla_report_priorities_present(client, admin_headers):
    r = client.get("/api/reports/sla", headers=admin_headers)
    priorities = {row["priority"] for row in r.json()["rows"]}
    assert {"Urgent", "High", "Medium", "Low"} == priorities


def test_sla_report_compliance_pct_range(client, admin_headers):
    r = client.get("/api/reports/sla", headers=admin_headers)
    data = r.json()
    assert 0.0 <= data["overall_compliance_pct"] <= 100.0
    for row in data["rows"]:
        assert 0.0 <= row["compliance_pct"] <= 100.0


def test_sla_report_counts_consistent(client, admin_headers):
    r = client.get("/api/reports/sla", headers=admin_headers)
    for row in r.json()["rows"]:
        assert row["within_sla"] + row["breached"] + row["no_sla_set"] == row["total"]


def test_sla_report_requires_admin(client, tech_headers):
    r = client.get("/api/reports/sla", headers=tech_headers)
    assert r.status_code in (403, 401)


def test_sla_csv_returns_csv(client, admin_headers):
    r = client.get("/api/reports/sla/csv", headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "sla_report.csv" in r.headers.get("content-disposition", "")


# ─── AR aging report ──────────────────────────────────────────────────────────

def _make_invoice(client, admin_headers, *, due_date, status="Sent", client_name="Aging Client"):
    body = {
        "client_name": client_name,
        "client_email": "aging@example.com",
        "client_address": "",
        "status": status,
        "issue_date": "2026-01-01",
        "due_date": due_date,
        "notes": "",
        "tax_rate": 0,
        "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }
    r = client.post("/api/invoices", json=body, headers=admin_headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_ar_aging_report_shape(client, admin_headers):
    r = client.get("/api/reports/ar-aging", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "buckets" in data
    assert "invoices" in data
    assert "grand_total_outstanding" in data
    labels = {b["label"] for b in data["buckets"]}
    assert labels == {"Current", "1-30", "31-60", "61-90", "90+"}


def test_ar_aging_bucket_boundaries(client, admin_headers):
    as_of = "2026-07-03"
    # due exactly 30, 31, 60, 61, 90, 91 days before as_of
    cases = {
        30: "1-30", 31: "31-60", 60: "31-60", 61: "61-90", 90: "61-90", 91: "90+",
    }
    ids = {}
    for days, expected_bucket in cases.items():
        due = (date.fromisoformat(as_of) - timedelta(days=days)).isoformat()
        ids[days] = (_make_invoice(client, admin_headers, due_date=due, client_name=f"Aging {days}"), expected_bucket)

    r = client.get("/api/reports/ar-aging", params={"as_of": as_of}, headers=admin_headers)
    data = r.json()
    by_id = {inv["invoice_id"]: inv for inv in data["invoices"]}
    for days, (inv_id, expected_bucket) in ids.items():
        assert by_id[inv_id]["bucket"] == expected_bucket, f"{days} days overdue should bucket as {expected_bucket}"


def test_ar_aging_excludes_paid_invoices(client, admin_headers):
    inv_id = _make_invoice(client, admin_headers, due_date="2026-01-01", status="Paid")
    r = client.get("/api/reports/ar-aging", headers=admin_headers)
    ids = {inv["invoice_id"] for inv in r.json()["invoices"]}
    assert inv_id not in ids


def test_ar_aging_excludes_void_invoices(client, admin_headers):
    inv_id = _make_invoice(client, admin_headers, due_date="2026-01-01", status="Void")
    r = client.get("/api/reports/ar-aging", headers=admin_headers)
    ids = {inv["invoice_id"] for inv in r.json()["invoices"]}
    assert inv_id not in ids


def test_ar_aging_excludes_zero_balance_invoice(client, admin_headers):
    inv_id = _make_invoice(client, admin_headers, due_date="2026-01-01", status="Sent")
    r = client.post(f"/api/invoices/{inv_id}/payments", json={
        "amount": 100, "method": "cash", "note": "", "payment_date": "2026-01-15",
    }, headers=admin_headers)
    assert r.status_code == 201

    r = client.get("/api/reports/ar-aging", headers=admin_headers)
    ids = {inv["invoice_id"] for inv in r.json()["invoices"]}
    assert inv_id not in ids


def test_ar_aging_requires_admin(client, tech_headers):
    r = client.get("/api/reports/ar-aging", headers=tech_headers)
    assert r.status_code in (403, 401)


def test_ar_aging_csv_returns_csv(client, admin_headers):
    r = client.get("/api/reports/ar-aging/csv", headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "ar_aging_report.csv" in r.headers.get("content-disposition", "")
