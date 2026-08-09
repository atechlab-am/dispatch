from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Branding, User, UserRole
from ..security import hash_password

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupBrandingIn(BaseModel):
    company_name: str = Field("Your Company", max_length=255)
    tagline: str = Field("", max_length=255)
    primary_color: str = Field("#2563EB", max_length=20)
    accent_color: str = Field("#F59E0B", max_length=20)
    logo_url: str = ""


class SetupIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    branding: SetupBrandingIn | None = None


def _admin_exists(db: Session) -> bool:
    return db.query(User).filter(User.role == UserRole.admin).first() is not None


@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    return {"needs_setup": not _admin_exists(db)}


@router.post("/complete", status_code=status.HTTP_201_CREATED)
def setup_complete(body: SetupIn, db: Session = Depends(get_db)):
    if _admin_exists(db):
        raise HTTPException(status_code=409, detail="Setup already complete")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.admin,
    )
    db.add(user)

    if body.branding:
        b = db.query(Branding).filter(Branding.id == 1).first() or Branding(id=1)
        b.company_name = body.branding.company_name
        b.tagline = body.branding.tagline
        b.primary_color = body.branding.primary_color
        b.accent_color = body.branding.accent_color
        b.logo_url = body.branding.logo_url
        b.updated_at = datetime.now(timezone.utc)
        db.add(b)

    db.commit()
    return {"ok": True}
