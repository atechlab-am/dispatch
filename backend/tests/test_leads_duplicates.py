"""Tests for GET /api/leads/check-duplicates — fuzzy match on business name,
exact match on website/phone, checked against all leads including lost."""


def _make_lead(client, admin_headers, **overrides):
    body = {"business_name": "Ton Dentiste - Dental Center", "website": "", "phone": ""}
    body.update(overrides)
    r = client.post("/api/leads", json=body, headers=admin_headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_no_query_returns_empty(client, admin_headers):
    r = client.get("/api/leads/check-duplicates", headers=admin_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_business_name_substring_match(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Ton Dentiste - Dental Center")
    r = client.get("/api/leads/check-duplicates", params={"business_name": "ton dentiste"}, headers=admin_headers)
    assert r.status_code == 200
    matches = r.json()
    assert any("business_name" in m["matched_on"] for m in matches)


def test_short_fragment_excluded(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Co Testing Excluded")
    r = client.get("/api/leads/check-duplicates", params={"business_name": "Co"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_website_exact_match(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Website Match Co", website="https://www.example-dup.com/")
    r = client.get("/api/leads/check-duplicates", params={"website": "example-dup.com"}, headers=admin_headers)
    matches = r.json()
    assert any("website" in m["matched_on"] for m in matches)


def test_phone_exact_match(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Phone Match Co", phone="(555) 123-9876")
    r = client.get("/api/leads/check-duplicates", params={"phone": "5551239876"}, headers=admin_headers)
    matches = r.json()
    assert any("phone" in m["matched_on"] for m in matches)


def test_matches_include_lost_leads(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Already Lost Prospect Co", phone="555-777-1234")
    client.post(f"/api/leads/{lead['id']}/stage", json={"stage": "lost", "lost_reason": "Not interested"}, headers=admin_headers)
    r = client.get("/api/leads/check-duplicates", params={"phone": "5557771234"}, headers=admin_headers)
    matches = r.json()
    assert any(m["id"] == lead["id"] and m["stage"] == "lost" for m in matches)


def test_website_and_phone_can_both_match_without_name_match(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Totally Different Name Inc", website="uniquesite123.com", phone="555-444-3333")
    r = client.get(
        "/api/leads/check-duplicates",
        params={"business_name": "Nothing Alike", "website": "uniquesite123.com", "phone": "5554443333"},
        headers=admin_headers,
    )
    matches = [m for m in r.json() if m["id"] == lead["id"]]
    assert len(matches) == 1
    assert set(matches[0]["matched_on"]) == {"website", "phone"}


def test_business_name_fuzzy_typo_match(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Riverside Dental Clinic")
    r = client.get("/api/leads/check-duplicates", params={"business_name": "Riverside Dentl Clinic"}, headers=admin_headers)
    matches = r.json()
    assert any("business_name" in m["matched_on"] for m in matches)


def test_contact_name_fuzzy_match(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Contact Name Test Co", contact_name="Jonathan Smith")
    r = client.get("/api/leads/check-duplicates", params={"contact_name": "Jonathon Smith"}, headers=admin_headers)
    matches = [m for m in r.json() if m["id"] == lead["id"]]
    assert len(matches) == 1
    assert "contact_name" in matches[0]["matched_on"]


def test_contact_email_exact_match(client, admin_headers):
    lead = _make_lead(client, admin_headers, business_name="Contact Email Test Co", contact_email="Jane@Example.com")
    r = client.get("/api/leads/check-duplicates", params={"contact_email": "jane@example.com"}, headers=admin_headers)
    matches = [m for m in r.json() if m["id"] == lead["id"]]
    assert len(matches) == 1
    assert "contact_email" in matches[0]["matched_on"]


def test_contact_email_different_domain_does_not_match(client, admin_headers):
    _make_lead(client, admin_headers, business_name="Contact Email No Match Co", contact_email="jane@example.com")
    r = client.get("/api/leads/check-duplicates", params={"contact_email": "jane@other.com"}, headers=admin_headers)
    assert r.json() == []
