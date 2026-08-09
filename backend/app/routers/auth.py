from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, RefreshToken
from ..schemas import LoginIn, TokenOut, LoginResultOut, Verify2FAIn, RefreshIn, UserOut
from ..security import (
    verify_password, create_access_token, create_refresh_token,
    hash_token, get_current_user,
    create_2fa_pending_token, verify_2fa_pending_token,
)
from .. import config
from .. import totp as totp_lib

router = APIRouter(prefix="/auth", tags=["auth"])
_limiter = Limiter(key_func=get_remote_address)


def _issue_tokens(db: Session, user: User) -> TokenOut:
    access = create_access_token(user.id)
    raw_refresh, expires_at = create_refresh_token(user.id)
    db.add(RefreshToken(
        token_hash=hash_token(raw_refresh),
        user_id=user.id,
        expires_at=expires_at,
    ))
    db.commit()
    return TokenOut(access_token=access, refresh_token=raw_refresh)


@router.post("/login", response_model=LoginResultOut)
@_limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.active == True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    if config.FEATURE_2FA and user.totp_enabled:
        return LoginResultOut(requires_2fa=True, login_token=create_2fa_pending_token(user.id))

    tokens = _issue_tokens(db, user)
    return LoginResultOut(access_token=tokens.access_token, refresh_token=tokens.refresh_token)


@router.post("/login/2fa", response_model=TokenOut)
@_limiter.limit("10/minute")
def login_2fa(request: Request, body: Verify2FAIn, db: Session = Depends(get_db)):
    user_id = verify_2fa_pending_token(body.login_token)
    user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not user or not user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired login session")

    if totp_lib.verify_code(user.totp_secret, body.code):
        return _issue_tokens(db, user)

    remaining = totp_lib.consume_backup_code(user.backup_codes, body.code)
    if remaining is not None:
        user.backup_codes = remaining
        db.commit()
        return _issue_tokens(db, user)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication code")


@router.post("/refresh", response_model=TokenOut)
@_limiter.limit("30/minute")
def refresh(request: Request, body: RefreshIn, db: Session = Depends(get_db)):
    token_hash = hash_token(body.refresh_token)
    now = datetime.now(timezone.utc)

    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.expires_at > now,
    ).first()

    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == record.user_id, User.active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate — delete old, issue new
    db.delete(record)
    access = create_access_token(user.id)
    raw_refresh, expires_at = create_refresh_token(user.id)
    db.add(RefreshToken(
        token_hash=hash_token(raw_refresh),
        user_id=user.id,
        expires_at=expires_at,
    ))
    db.commit()

    return TokenOut(access_token=access, refresh_token=raw_refresh)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).delete()
    db.commit()
    return {"ok": True}


# ─── Two-factor auth setup (self-service, on the current user's own account) ──

def _require_2fa_enabled():
    if not config.FEATURE_2FA:
        raise HTTPException(status_code=503, detail="This feature is disabled")


class TwoFASetupOut(BaseModel):
    secret: str
    qr_code: str  # data: URI PNG


@router.post("/2fa/setup", response_model=TwoFASetupOut)
def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates a new secret and QR code. Not yet active — /2fa/enable must
    verify a code from it first. Calling this again before enabling replaces
    the pending secret (e.g. the user rescans after a first failed attempt)."""
    _require_2fa_enabled()
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor auth is already enabled")
    secret = totp_lib.generate_secret()
    current_user.totp_secret = secret
    db.commit()
    uri = totp_lib.provisioning_uri(secret, current_user.email)
    return TwoFASetupOut(secret=secret, qr_code=totp_lib.qr_code_data_uri(uri))


class TwoFAEnableIn(BaseModel):
    code: str = Field(..., max_length=20)


class TwoFAEnableOut(BaseModel):
    backup_codes: list[str]


@router.post("/2fa/enable", response_model=TwoFAEnableOut)
def enable_2fa(
    body: TwoFAEnableIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_2fa_enabled()
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor auth is already enabled")
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Call /auth/2fa/setup first")
    if not totp_lib.verify_code(current_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid authentication code")

    codes, hashed_json = totp_lib.generate_backup_codes()
    current_user.totp_enabled = True
    current_user.backup_codes = hashed_json
    db.commit()
    return TwoFAEnableOut(backup_codes=codes)


class TwoFADisableIn(BaseModel):
    password: str


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
def disable_2fa(
    body: TwoFADisableIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_2fa_enabled()
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.backup_codes = None
    db.commit()
