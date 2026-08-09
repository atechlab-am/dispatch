"""Tests for the ticket CSV export endpoint."""
import io
import csv


def test_export_returns_csv(client, admin_headers):
    r = client.get("/api/tickets/export", headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "attachment" in r.headers.get("content-disposition", "")


def test_export_has_header_row(client, admin_headers):
    r = client.get("/api/tickets/export", headers=admin_headers)
    reader = csv.reader(io.StringIO(r.text))
    header = next(reader)
    assert "Ticket ID" in header
    assert "Status" in header
    assert "Priority" in header
    assert "Client Name" in header
    assert "Grand Total" in header


def test_export_filter_by_status(client, admin_headers):
    r = client.get("/api/tickets/export", params={"status": "Open"}, headers=admin_headers)
    reader = csv.DictReader(io.StringIO(r.text))
    for row in reader:
        assert row["Status"] == "Open"


def test_export_filter_by_priority(client, admin_headers):
    r = client.get("/api/tickets/export", params={"priority": "High"}, headers=admin_headers)
    reader = csv.DictReader(io.StringIO(r.text))
    for row in reader:
        assert row["Priority"] == "High"


def test_export_filter_by_client_name(client, admin_headers):
    r = client.get("/api/tickets/export", params={"client_name": "Acme"}, headers=admin_headers)
    reader = csv.DictReader(io.StringIO(r.text))
    for row in reader:
        assert "Acme" in row["Client Name"]


def test_export_empty_result_still_returns_header(client, admin_headers):
    r = client.get("/api/tickets/export", params={"client_name": "ZZZNobody"}, headers=admin_headers)
    assert r.status_code == 200
    reader = csv.reader(io.StringIO(r.text))
    header = next(reader)
    assert len(header) > 0
    rows = list(reader)
    assert rows == []


def test_export_date_to_end_of_month(client, admin_headers):
    # date_to on the last day of a month used to crash (day + 1 → invalid date)
    r = client.get("/api/tickets/export", params={"date_to": "2026-06-30"}, headers=admin_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]


def test_export_date_to_end_of_year(client, admin_headers):
    # Dec 31 forces both day and month rollover
    r = client.get("/api/tickets/export", params={"date_to": "2026-12-31"}, headers=admin_headers)
    assert r.status_code == 200


def test_export_date_range(client, admin_headers):
    r = client.get("/api/tickets/export",
                   params={"date_from": "2026-01-01", "date_to": "2026-01-31"}, headers=admin_headers)
    assert r.status_code == 200


def test_export_requires_auth(client):
    r = client.get("/api/tickets/export")
    assert r.status_code in (401, 403)
