from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import LoginPageBranding, User
from ..security import require_admin

router = APIRouter(prefix="/login-branding", tags=["login-branding"])


class LoginBrandingIn(BaseModel):
    company_name: str = Field("Your Company", max_length=255)
    subtitle: str = Field("internal use only", max_length=255)
    primary_color: str = Field("#2563EB", max_length=20)
    accent_color: str = Field("#F59E0B", max_length=20)
    text_color: str = Field("#0D1B2A", max_length=20)
    muted_color: str = Field("#5B6D82", max_length=20)
    on_color_text: str = Field("#FFFFFF", max_length=20)
    logo_url: str = ""


class LoginBrandingOut(LoginBrandingIn):
    updated_at: datetime
    model_config = {"from_attributes": True}


def _get_or_create(db: Session) -> LoginPageBranding:
    b = db.query(LoginPageBranding).filter(LoginPageBranding.id == 1).first()
    if not b:
        b = LoginPageBranding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


@router.get("/public", response_model=LoginBrandingOut)
def get_login_branding_public(db: Session = Depends(get_db)):
    """No auth — the login page itself renders before any staff JWT exists."""
    return _get_or_create(db)


@router.get("", response_model=LoginBrandingOut)
def get_login_branding(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return _get_or_create(db)


@router.put("", response_model=LoginBrandingOut)
def update_login_branding(
    body: LoginBrandingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    b = _get_or_create(db)
    b.company_name = body.company_name
    b.subtitle = body.subtitle
    b.primary_color = body.primary_color
    b.accent_color = body.accent_color
    b.text_color = body.text_color
    b.muted_color = body.muted_color
    b.on_color_text = body.on_color_text
    b.logo_url = body.logo_url
    b.updated_at = datetime.now(timezone.utc)
    b.updated_by = current_user.id
    db.commit()
    db.refresh(b)
    return b
