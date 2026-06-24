def test_admin_can_list_users(client, admin_headers):
    r = client.get("/api/users", headers=admin_headers)
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert "admin@test.com" in emails


def test_technician_cannot_list_users(client, tech_headers):
    r = client.get("/api/users", headers=tech_headers)
    assert r.status_code == 403


def test_admin_can_create_user(client, admin_headers):
    r = client.post("/api/users", json={
        "email": "new@test.com",
        "name": "New User",
        "password": "newpass123",
        "role": "technician",
    }, headers=admin_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "new@test.com"
    assert data["role"] == "technician"


def test_duplicate_email_rejected(client, admin_headers):
    r = client.post("/api/users", json={
        "email": "admin@test.com",
        "name": "Dup",
        "password": "x",
        "role": "technician",
    }, headers=admin_headers)
    assert r.status_code == 409


def test_invalid_role_rejected(client, admin_headers):
    r = client.post("/api/users", json={
        "email": "bad_role@test.com",
        "name": "Bad",
        "password": "x",
        "role": "superuser",
    }, headers=admin_headers)
    assert r.status_code == 422


def test_technician_cannot_create_user(client, tech_headers):
    r = client.post("/api/users", json={
        "email": "another@test.com",
        "name": "Another",
        "password": "x",
        "role": "technician",
    }, headers=tech_headers)
    assert r.status_code == 403
