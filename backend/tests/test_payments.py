"""Tests for Stripe online payments: portal checkout session creation and the
webhook receiver. Stripe's SDK is always mocked — these tests never call the
real Stripe API."""
import itertools
import pytest
from unittest.mock import patch, MagicMock

from app import config

_email_counter = itertools.count()


@pytest.fixture()
def paid_client_setup(client, admin_headers):
    """A client with a portal account and an invoice with an outstanding balance."""
    n = next(_email_counter)
    r = client.post("/api/clients", json={
        "name": "Payer Co", "email": "payer@example.com", "phone": "", "address": "",
        "client_type": "business", "company": f"Payer Co {n}", "notes": "",
    }, headers=admin_headers)
    client_id = r.json()["id"]

    r = client.post("/api/portal/accounts", json={
        "client_id": client_id, "email": f"portaluser{n}@payer.com", "name": "Portal User", "password": "portalpass123",
    }, headers=admin_headers)
    assert r.status_code == 201

    r = client.post("/api/invoices", json={
        "client_id": client_id, "client_name": "Payer Co", "client_email": "payer@example.com",
        "client_address": "", "status": "Sent", "issue_date": "2026-06-01", "due_date": "2026-06-30",
        "notes": "", "tax_rate": 0, "lines": [{"description": "Work", "qty": 1, "unit_price": 100, "amount": 100}],
    }, headers=admin_headers)
    invoice_id = r.json()["id"]

    r = client.post("/api/portal/auth/login", json={"email": f"portaluser{n}@payer.com", "password": "portalpass123"})
    assert r.status_code == 200
    portal_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    return {"client_id": client_id, "invoice_id": invoice_id, "portal_headers": portal_headers}


def _mock_stripe_session(url="https://checkout.stripe.com/test-session"):
    session = MagicMock()
    session.id = "cs_test_123"
    session.url = url
    return session


def test_checkout_session_created_for_payable_invoice(client, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "sk_test_fake")
    with patch("stripe.checkout.Session.create", return_value=_mock_stripe_session()) as mock_create:
        r = client.post(
            f"/api/portal/invoices/{paid_client_setup['invoice_id']}/checkout",
            headers=paid_client_setup["portal_headers"],
        )
    assert r.status_code == 200
    assert r.json()["checkout_url"] == "https://checkout.stripe.com/test-session"
    mock_create.assert_called_once()


def test_checkout_session_requires_stripe_configured(client, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "")
    r = client.post(
        f"/api/portal/invoices/{paid_client_setup['invoice_id']}/checkout",
        headers=paid_client_setup["portal_headers"],
    )
    assert r.status_code == 503


def test_checkout_session_rejects_other_clients_invoice(client, admin_headers, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "sk_test_fake")
    # A second, unrelated client + portal account
    r = client.post("/api/clients", json={
        "name": "Other Co", "email": "other@example.com", "phone": "", "address": "",
        "client_type": "business", "company": "Other Co", "notes": "",
    }, headers=admin_headers)
    other_client_id = r.json()["id"]
    client.post("/api/portal/accounts", json={
        "client_id": other_client_id, "email": "other@portal.com", "name": "Other User", "password": "otherpass123",
    }, headers=admin_headers)
    r = client.post("/api/portal/auth/login", json={"email": "other@portal.com", "password": "otherpass123"})
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    with patch("stripe.checkout.Session.create", return_value=_mock_stripe_session()):
        r = client.post(
            f"/api/portal/invoices/{paid_client_setup['invoice_id']}/checkout",
            headers=other_headers,
        )
    assert r.status_code == 404


def test_checkout_session_rejects_already_paid_invoice(client, admin_headers, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "sk_test_fake")
    client.post(f"/api/invoices/{paid_client_setup['invoice_id']}/payments", json={
        "amount": 100, "method": "cash", "note": "", "payment_date": "2026-06-15",
    }, headers=admin_headers)

    with patch("stripe.checkout.Session.create", return_value=_mock_stripe_session()):
        r = client.post(
            f"/api/portal/invoices/{paid_client_setup['invoice_id']}/checkout",
            headers=paid_client_setup["portal_headers"],
        )
    assert r.status_code == 400


# ─── Webhook ──────────────────────────────────────────────────────────────────

def _checkout_completed_event(invoice_id, payment_intent="pi_test_123", amount_total=10000):
    return {
        "type": "checkout.session.completed",
        "data": {"object": {
            "metadata": {"invoice_id": invoice_id},
            "payment_intent": payment_intent,
            "amount_total": amount_total,
        }},
    }


def test_webhook_requires_secret_configured(client, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "")
    r = client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    assert r.status_code == 503


def test_webhook_rejects_invalid_signature(client, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    import stripe
    with patch("stripe.Webhook.construct_event", side_effect=stripe.error.SignatureVerificationError("bad sig", "sig")):
        r = client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "bad"})
    assert r.status_code == 400


def test_webhook_creates_payment_with_null_recorded_by(client, admin_headers, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    event = _checkout_completed_event(paid_client_setup["invoice_id"])
    with patch("stripe.Webhook.construct_event", return_value=event):
        r = client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    assert r.status_code == 200

    payments = client.get(f"/api/invoices/{paid_client_setup['invoice_id']}/payments", headers=admin_headers).json()
    stripe_payments = [p for p in payments if p["method"] == "stripe"]
    assert len(stripe_payments) == 1
    assert stripe_payments[0]["recorded_by"] is None

    inv = client.get(f"/api/invoices/{paid_client_setup['invoice_id']}", headers=admin_headers).json()
    assert inv["status"] == "Paid"


def test_webhook_is_idempotent_on_replay(client, admin_headers, paid_client_setup, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    event = _checkout_completed_event(paid_client_setup["invoice_id"], payment_intent="pi_replay_test")
    with patch("stripe.Webhook.construct_event", return_value=event):
        r1 = client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
        r2 = client.post("/api/payments/webhook", content=b"{}", headers={"stripe-signature": "sig"})
    assert r1.status_code == 200
    assert r2.status_code == 200

    payments = client.get(f"/api/invoices/{paid_client_setup['invoice_id']}/payments", headers=admin_headers).json()
    matching = [p for p in payments if p.get("recorded_by") is None and p["method"] == "stripe"]
    assert len(matching) == 1
