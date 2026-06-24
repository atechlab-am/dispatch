def test_login_success(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "adminpass"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "wrong"})
    assert r.status_code == 401
    assert "Incorrect" in r.json()["detail"]


def test_login_unknown_email(client):
    r = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "x"})
    assert r.status_code == 401
    # Same message — no user enumeration
    assert "Incorrect" in r.json()["detail"]


def test_me(client, admin_headers):
    r = client.get("/api/auth/me", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "admin@test.com"
    assert data["role"] == "admin"


def test_me_no_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 403  # HTTPBearer returns 403 when header is missing


def test_me_bad_token(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert r.status_code == 401


def test_refresh(client):
    login = client.post("/api/auth/login", json={"email": "tech@test.com", "password": "techpass"})
    refresh_token = login.json()["refresh_token"]

    r = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    # Old refresh token should now be invalid (rotation)
    r2 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 401


def test_logout(client):
    login = client.post("/api/auth/login", json={"email": "tech@test.com", "password": "techpass"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/api/auth/logout", headers=headers)
    assert r.status_code == 200
