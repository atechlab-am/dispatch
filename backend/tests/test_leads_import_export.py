"""Tests for CSV import/export of leads: header aliases, value aliases,
encoding fallback, per-row error isolation, and sample-CSV round-trip."""
import csv
import io


def _csv_file(content: str, filename: str = "leads.csv"):
    return {"file": (filename, io.BytesIO(content.encode("utf-8")), "text/csv")}


def test_import_requires_business_name_column(client, admin_headers):
    content = "Name Missing,Category\nfoo,bar\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 400


def test_import_creates_leads_with_human_headers(client, admin_headers):
    content = (
        "Business Name,Category,Area,Priority,Status\n"
        "Import Header Co,Landscaping,Uptown,High,New\n"
    )
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 1
    assert body["errors"] == []

    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "Import Header Co")
    assert created["industry"] == "Landscaping"
    assert created["area"] == "Uptown"
    assert created["priority"] == "high"


def test_import_title_defaults_to_business_name(client, admin_headers):
    content = "Business Name\nNo Title Provided Co\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "No Title Provided Co")
    assert created["title"] == "No Title Provided Co"


def test_import_row_errors_do_not_block_valid_rows(client, admin_headers):
    content = (
        "Business Name,Priority\n"
        "Valid Row Co,High\n"
        ",High\n"  # missing business name
        "Bad Priority Co,urgent-ish\n"  # invalid priority alias
    )
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    body = r.json()
    assert body["created"] == 1
    assert len(body["errors"]) == 2
    assert body["errors"][0]["row"] == 3
    assert body["errors"][1]["row"] == 4


def test_import_priority_alias(client, admin_headers):
    content = "Business Name,Priority\nAlias Priority Co,hi\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "Alias Priority Co")
    assert created["priority"] == "high"


def test_import_priority_tolerates_trailing_punctuation_and_typos(client, admin_headers):
    content = (
        "Business Name,Priority\n"
        "Punctuation Priority Co,Med.\n"
        "Typo Priority Co,Hgih\n"
    )
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2
    assert r.json()["errors"] == []
    leads = client.get("/api/leads", headers=admin_headers).json()
    assert next(l for l in leads if l["business_name"] == "Punctuation Priority Co")["priority"] == "medium"
    assert next(l for l in leads if l["business_name"] == "Typo Priority Co")["priority"] == "high"


def test_import_still_rejects_genuinely_invalid_priority(client, admin_headers):
    content = "Business Name,Priority\nInvalid Priority Co,urgent\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    assert r.json()["created"] == 0
    assert len(r.json()["errors"]) == 1
    assert "Invalid priority" in r.json()["errors"][0]["error"]


def test_import_source_alias(client, admin_headers):
    content = "Business Name,Source\nAlias Source Co,cold call\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "Alias Source Co")
    assert created["source"] == "outbound"


def test_import_stage_alias(client, admin_headers):
    content = "Business Name,Status\nAlias Stage Co,Not Contacted\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200
    assert r.json()["created"] == 1
    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "Alias Stage Co")
    assert created["stage"] == "new"


def test_import_tolerant_of_dollar_and_comma_in_value_estimate(client, admin_headers):
    content = "Business Name,value_estimate\nValue Estimate Co,\"$1,500.00\"\n"
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(content))
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1
    leads = client.get("/api/leads", headers=admin_headers).json()
    created = next(l for l in leads if l["business_name"] == "Value Estimate Co")
    assert created["value_estimate"] == 1500.0


def test_import_empty_file_rejected(client, admin_headers):
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(""))
    assert r.status_code == 400


def test_sample_csv_round_trips(client, admin_headers):
    sample = client.get("/api/leads/import/sample", headers=admin_headers)
    assert sample.status_code == 200
    r = client.post("/api/leads/import", headers=admin_headers, files=_csv_file(sample.text))
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3
    assert r.json()["errors"] == []


def test_export_returns_csv_with_created_lead(client, admin_headers):
    r = client.post("/api/leads", json={"business_name": "Export Test Co"}, headers=admin_headers)
    assert r.status_code == 201

    export = client.get("/api/leads/export", headers=admin_headers)
    assert export.status_code == 200
    rows = list(csv.reader(io.StringIO(export.text)))
    header = rows[0]
    assert "business_name" in header
    name_idx = header.index("business_name")
    assert any(row[name_idx] == "Export Test Co" for row in rows[1:])
