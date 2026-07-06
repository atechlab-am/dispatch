"""TOTP (time-based one-time password) helpers for staff 2FA.

Secrets are stored raw (base32, as pyotp generates them) on User.totp_secret —
not encrypted at rest, matching this codebase's existing precedent of storing
sensitive tokens hashed-not-encrypted (refresh tokens) or as plain secrets in
env vars (Stripe keys). Backup codes are bcrypt-hashed since, unlike a TOTP
secret, they're used exactly like a password.
"""
import base64
import io
import json
import secrets

import pyotp
import qrcode
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BACKUP_CODE_COUNT = 10


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str, issuer: str = "Dispatch") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def qr_code_data_uri(uri: str) -> str:
    """Render the otpauth:// URI as a PNG data URI for inline <img src=...>."""
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def verify_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_backup_codes() -> tuple[list[str], str]:
    """Return (plaintext codes to show the user once, JSON of their bcrypt hashes to store)."""
    codes = [secrets.token_hex(4) for _ in range(BACKUP_CODE_COUNT)]
    hashed = [_pwd_context.hash(c) for c in codes]
    return codes, json.dumps(hashed)


def consume_backup_code(stored_json: str, code: str) -> str | None:
    """Return the updated stored_json with the matched code removed, or None if no match."""
    if not stored_json or not code:
        return None
    hashes = json.loads(stored_json)
    for h in hashes:
        if _pwd_context.verify(code, h):
            remaining = [x for x in hashes if x != h]
            return json.dumps(remaining)
    return None
