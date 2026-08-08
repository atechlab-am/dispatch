def test_setup_status_needs_setup_false_when_admin_exists(client):
    """Fixture already seeds an admin — setup should report not needed."""
    r = client.get("/api/setup/status")
    assert r.status_code == 200
    assert r.json()["needs_setup"] is False


def test_setup_complete_locked_when_admin_exists(client):
    """POST /api/setup/complete must return 409 if an admin already exists."""
    r = client.post("/api/setup/complete", json={
        "name": "Another",
        "email": "another@test.com",
        "password": "validpass123",
    })
    assert r.status_code == 409


def test_setup_complete_on_fresh_db(client_no_seed):
    """On a fresh DB (no users), setup should succeed and return 201."""
    r = client_no_seed.post("/api/setup/complete", json={
        "name": "Admin",
        "email": "admin@fresh.com",
        "password": "freshpass123",
    })
    assert r.status_code == 201
    assert r.json()["ok"] is True


def test_setup_status_needs_setup_true_on_fresh_db(client_no_seed):
    r = client_no_seed.get("/api/setup/status")
    assert r.status_code == 200
    assert r.json()["needs_setup"] is True


def test_setup_short_password_rejected(client_no_seed):
    r = client_no_seed.post("/api/setup/complete", json={
        "name": "Admin",
        "email": "admin@fresh.com",
        "password": "short",
    })
    assert r.status_code == 422


def test_setup_locked_after_first_use(client_no_seed):
    """Once setup completes, calling it again returns 409."""
    client_no_seed.post("/api/setup/complete", json={
        "name": "Admin",
        "email": "first@test.com",
        "password": "goodpassword",
    })
    r = client_no_seed.post("/api/setup/complete", json={
        "name": "Second",
        "email": "second@test.com",
        "password": "goodpassword",
    })
    assert r.status_code == 409


def test_setup_complete_applies_branding_when_provided(client_no_seed):
    r = client_no_seed.post("/api/setup/complete", json={
        "name": "Admin",
        "email": "admin@fresh.com",
        "password": "freshpass123",
        "branding": {
            "company_name": "Acme Inc",
            "tagline": "We fix things",
            "primary_color": "#111111",
            "accent_color": "#222222",
            "logo_url": "",
        },
    })
    assert r.status_code == 201

    login = client_no_seed.post("/api/auth/login", json={
        "email": "admin@fresh.com",
        "password": "freshpass123",
    })
    token = login.json()["access_token"]
    b = client_no_seed.get("/api/branding", headers={"Authorization": f"Bearer {token}"})
    assert b.status_code == 200
    assert b.json()["company_name"] == "Acme Inc"
    assert b.json()["tagline"] == "We fix things"
    assert b.json()["primary_color"] == "#111111"


def test_setup_complete_without_branding_keeps_defaults(client_no_seed):
    r = client_no_seed.post("/api/setup/complete", json={
        "name": "Admin",
        "email": "admin@fresh.com",
        "password": "freshpass123",
    })
    assert r.status_code == 201

    login = client_no_seed.post("/api/auth/login", json={
        "email": "admin@fresh.com",
        "password": "freshpass123",
    })
    token = login.json()["access_token"]
    b = client_no_seed.get("/api/branding", headers={"Authorization": f"Bearer {token}"})
    assert b.status_code == 200
    assert b.json()["company_name"] == "Your Company"
