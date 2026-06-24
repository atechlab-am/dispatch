from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, RefreshToken
from ..schemas import LoginIn, TokenOut, RefreshIn, UserOut
from ..security import (
    verify_password, create_access_token, create_refresh_token,
    hash_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.active == True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access = create_access_token(user.id)
    raw_refresh, expires_at = create_refresh_token(user.id)

    db.add(RefreshToken(
        token_hash=hash_token(raw_refresh),
        user_id=user.id,
        expires_at=expires_at,
    ))
    db.commit()

    return TokenOut(access_token=access, refresh_token=raw_refresh)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
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
