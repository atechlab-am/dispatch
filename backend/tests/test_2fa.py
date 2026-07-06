"""Tests for two-factor auth (TOTP) — setup/enable/disable and the two-step
login flow. Uses dedicated users (not the shared admin/tech fixtures) so
enabling 2FA doesn't affect other tests sharing those sessions.

/auth/login is rate-limited (10/min per IP) via an in-memory slowapi store
scoped to auth.py's own Limiter instance, and it persists for the whole
pytest process. This file calls /auth/login many times, so it resets that
limiter's storage before/around each login — safe here since this file
doesn't test the rate limit itself (that's covered elsewhere), it just can't
afford to be rationed by it.
"""
import pyotp
import pytest

from app import config
from app.routers.auth import _limiter as _app_limiter


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    _app_limiter.reset()
    yield


@pytest.fixture(scope="module", autouse=True)
def _enable_2fa_feature():
    """FEATURE_2FA defaults to False; this whole file exercises the
    feature turned on except where a test explicitly flips it off."""
    original = config.FEATURE_2FA
    config.FEATURE_2FA = True
    yield
    config.FEATURE_2FA = original


def _create_and_login(client, admin_headers, suffix):
    _app_limiter.reset()
    email = f"twofa_{suffix}@test.com"
    password = "twofapass123"
    r = client.post("/api/users", json={
        "email": email, "name": "2FA Test User", "password": password, "role": "technician",
    }, headers=admin_headers)
    assert r.status_code == 201
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return headers, email, password


def _enroll(client, headers):
    """Full setup + enable flow. Returns (secret, backup_codes)."""
    setup = client.post("/api/auth/2fa/setup", headers=headers).json()
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    enable = client.post("/api/auth/2fa/enable", json={"code": code}, headers=headers)
    assert enable.status_code == 200
    return secret, enable.json()["backup_codes"]


@pytest.fixture(scope="module")
def unenrolled_user(client, admin_headers):
    return _create_and_login(client, admin_headers, "unenrolled")


@pytest.fixture(scope="module")
def enrolled_user(client, admin_headers):
    """A user with 2FA fully enabled — shared read-only across several tests."""
    headers, email, password = _create_and_login(client, admin_headers, "enrolled")
    secret, backup_codes = _enroll(client, headers)
    return headers, email, password, secret, backup_codes


def test_login_without_2fa_returns_tokens_directly(client, unenrolled_user):
    headers, _, _ = unenrolled_user
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["totp_enabled"] is False


def test_setup_returns_secret_and_qr(client, unenrolled_user):
    headers, _, _ = unenrolled_user
    r = client.post("/api/auth/2fa/setup", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["secret"]) >= 16
    assert data["qr_code"].startswith("data:image/png;base64,")


def test_enable_rejects_wrong_code(client, unenrolled_user):
    headers, _, _ = unenrolled_user
    client.post("/api/auth/2fa/setup", headers=headers)
    r = client.post("/api/auth/2fa/enable", json={"code": "000000"}, headers=headers)
    assert r.status_code == 400


def test_enable_with_correct_code_returns_backup_codes(client, enrolled_user):
    _, _, _, _, backup_codes = enrolled_user
    assert len(backup_codes) == 10
    assert len(set(backup_codes)) == 10  # all unique


def test_me_reflects_totp_enabled(client, enrolled_user):
    headers, _, _, _, _ = enrolled_user
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["totp_enabled"] is True


def test_cannot_setup_again_once_enabled(client, enrolled_user):
    headers, _, _, _, _ = enrolled_user
    r = client.post("/api/auth/2fa/setup", headers=headers)
    assert r.status_code == 400


def test_login_with_2fa_enabled_requires_second_step(client, enrolled_user):
    _, email, password, _, _ = enrolled_user
    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    data = r.json()
    assert data["requires_2fa"] is True
    assert data["login_token"] is not None
    assert data["access_token"] is None


def test_login_2fa_with_correct_totp_code_succeeds(client, enrolled_user):
    _, email, password, secret, _ = enrolled_user
    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login_token = r.json()["login_token"]

    code = pyotp.TOTP(secret).now()
    r2 = client.post("/api/auth/login/2fa", json={"login_token": login_token, "code": code})
    assert r2.status_code == 200
    assert "access_token" in r2.json()


def test_login_2fa_with_wrong_code_fails(client, enrolled_user):
    _, email, password, _, _ = enrolled_user
    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login_token = r.json()["login_token"]

    r2 = client.post("/api/auth/login/2fa", json={"login_token": login_token, "code": "000000"})
    assert r2.status_code == 401


def test_login_2fa_pending_token_cannot_be_used_as_access_token(client, enrolled_user):
    _, email, password, _, _ = enrolled_user
    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login_token = r.json()["login_token"]

    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login_token}"})
    assert r2.status_code == 401


def test_login_2fa_with_backup_code_succeeds_and_consumes_it(client, admin_headers):
    # Uses its own user (not the shared `enrolled_user`) since consuming a
    # backup code mutates state that other tests in this file rely on staying intact.
    headers, email, password = _create_and_login(client, admin_headers, "backupcode")
    secret, backup_codes = _enroll(client, headers)
    a_code = backup_codes[0]

    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login_token = r.json()["login_token"]
    r2 = client.post("/api/auth/login/2fa", json={"login_token": login_token, "code": a_code})
    assert r2.status_code == 200

    # Re-authenticate once more to prove the same backup code is now spent.
    # (A single extra login here — deliberately not repeated across more assertions
    # to stay under the shared rate limit for this test file.)
    _app_limiter.reset()
    r3 = client.post("/api/auth/login", json={"email": email, "password": password})
    login_token2 = r3.json()["login_token"]
    r4 = client.post("/api/auth/login/2fa", json={"login_token": login_token2, "code": a_code})
    assert r4.status_code == 401


def test_disable_requires_correct_password(client, admin_headers):
    headers, email, password = _create_and_login(client, admin_headers, "disablewrong")
    _enroll(client, headers)
    r = client.post("/api/auth/2fa/disable", json={"password": "wrongpass"}, headers=headers)
    assert r.status_code == 401


def test_disable_with_correct_password_succeeds(client, admin_headers):
    headers, email, password = _create_and_login(client, admin_headers, "disableok")
    _enroll(client, headers)

    r = client.post("/api/auth/2fa/disable", json={"password": password}, headers=headers)
    assert r.status_code == 204

    me = client.get("/api/auth/me", headers=headers).json()
    assert me["totp_enabled"] is False


# ─── Toggle ────────────────────────────────────────────────────────────────

def test_2fa_reflected_in_config_when_enabled(client, admin_headers):
    r = client.get("/api/config", headers=admin_headers)
    assert r.json()["two_factor_auth"] is True


def test_2fa_setup_503_when_feature_disabled(client, unenrolled_user, monkeypatch):
    headers, _, _ = unenrolled_user
    monkeypatch.setattr(config, "FEATURE_2FA", False)
    r = client.post("/api/auth/2fa/setup", headers=headers)
    assert r.status_code == 503


def test_login_ignores_totp_enabled_when_feature_disabled(client, enrolled_user, monkeypatch):
    """Even if a user enrolled while the feature was on, flipping FEATURE_2FA
    off must not lock anyone out — login should skip straight to tokens."""
    _, email, password, _, _ = enrolled_user
    monkeypatch.setattr(config, "FEATURE_2FA", False)
    _app_limiter.reset()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    assert r.json()["requires_2fa"] is False
    assert r.json()["access_token"] is not None
