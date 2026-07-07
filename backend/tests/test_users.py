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
        "password": "validpass123",
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


def test_user_out_includes_active_field(client, admin_headers):
    r = client.get("/api/users", headers=admin_headers)
    assert r.status_code == 200
    for u in r.json():
        assert "active" in u
        assert isinstance(u["active"], bool)


def test_update_user_duplicate_email_rejected(client, admin_headers):
    # Create two users, then try to rename the second onto the first's email
    a = client.post("/api/users", json={"email": "dup_a@test.com", "name": "A",
        "password": "validpass123", "role": "technician"}, headers=admin_headers).json()
    b = client.post("/api/users", json={"email": "dup_b@test.com", "name": "B",
        "password": "validpass123", "role": "technician"}, headers=admin_headers).json()
    r = client.put(f"/api/users/{b['id']}", json={"name": "B", "email": "dup_a@test.com",
        "role": "technician", "active": True, "password": ""}, headers=admin_headers)
    assert r.status_code == 409


def test_update_user_keep_own_email_ok(client, admin_headers):
    u = client.post("/api/users", json={"email": "keep@test.com", "name": "Keep",
        "password": "validpass123", "role": "technician"}, headers=admin_headers).json()
    # Re-saving with the same email must not be treated as a clash
    r = client.put(f"/api/users/{u['id']}", json={"name": "Keep Renamed", "email": "keep@test.com",
        "role": "technician", "active": True, "password": ""}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Keep Renamed"


def test_admin_cannot_self_deactivate_via_update(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    r = client.put(f"/api/users/{me['id']}", json={"name": me["name"], "email": me["email"],
        "role": "admin", "active": False, "password": ""}, headers=admin_headers)
    assert r.status_code == 400


def test_admin_cannot_self_demote_via_update(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    r = client.put(f"/api/users/{me['id']}", json={"name": me["name"], "email": me["email"],
        "role": "technician", "active": True, "password": ""}, headers=admin_headers)
    assert r.status_code == 400


def test_change_own_password(client, tech_headers):
    r = client.put("/api/users/me/password", json={
        "current_password": "techpass",
        "new_password": "newsecurepass123",
    }, headers=tech_headers)
    assert r.status_code == 204


def test_change_password_wrong_current(client, tech_headers):
    r = client.put("/api/users/me/password", json={
        "current_password": "wrongpassword",
        "new_password": "doesntmatter",
    }, headers=tech_headers)
    assert r.status_code == 400


def test_change_password_requires_auth(client):
    r = client.put("/api/users/me/password", json={
        "current_password": "x",
        "new_password": "y",
    })
    assert r.status_code in (401, 403)
