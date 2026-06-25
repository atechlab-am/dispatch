"""Tests for Phase 10 — Reporting endpoints."""
from datetime import date


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
