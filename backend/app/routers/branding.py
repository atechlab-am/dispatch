from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Branding, User
from ..security import get_current_user, require_admin

router = APIRouter(prefix="/branding", tags=["branding"])


class BrandingIn(BaseModel):
    company_name: str = Field("ATech Solutions", max_length=255)
    tagline: str = Field("IT Support & Managed Services", max_length=255)
    primary_color: str = Field("#1A5CBA", max_length=20)
    accent_color: str = Field("#E8A020", max_length=20)
    logo_url: str = ""
    favicon_url: str = ""
    sidebar_dark: bool = True


class BrandingOut(BrandingIn):
    updated_at: datetime
    model_config = {"from_attributes": True}


def _get_or_create(db: Session) -> Branding:
    b = db.query(Branding).filter(Branding.id == 1).first()
    if not b:
        b = Branding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


@router.get("", response_model=BrandingOut)
def get_branding(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _get_or_create(db)


@router.put("", response_model=BrandingOut)
def update_branding(
    body: BrandingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    b = _get_or_create(db)
    b.company_name = body.company_name
    b.tagline = body.tagline
    b.primary_color = body.primary_color
    b.accent_color = body.accent_color
    b.logo_url = body.logo_url
    b.favicon_url = body.favicon_url
    b.sidebar_dark = body.sidebar_dark
    b.updated_at = datetime.now(timezone.utc)
    b.updated_by = current_user.id
    db.commit()
    db.refresh(b)
    return b
