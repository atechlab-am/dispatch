from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import DocumentBranding, User
from ..security import require_admin, get_current_user

router = APIRouter(prefix="/document-branding", tags=["document-branding"])


class DocumentBrandingIn(BaseModel):
    company_name: str = Field("ATech Solutions", max_length=255)
    website: str = Field("atechsolutions.org", max_length=255)
    primary_color: str = Field("#1A5CBA", max_length=20)
    accent_color: str = Field("#E8A020", max_length=20)
    logo_url: str = ""
    footer_text: str = Field("Thank you for your business", max_length=500)


class DocumentBrandingOut(DocumentBrandingIn):
    updated_at: datetime
    model_config = {"from_attributes": True}


def _get_or_create(db: Session) -> DocumentBranding:
    b = db.query(DocumentBranding).filter(DocumentBranding.id == 1).first()
    if not b:
        b = DocumentBranding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


@router.get("", response_model=DocumentBrandingOut)
def get_document_branding(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _get_or_create(db)


@router.put("", response_model=DocumentBrandingOut)
def update_document_branding(
    body: DocumentBrandingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    b = _get_or_create(db)
    b.company_name = body.company_name
    b.website = body.website
    b.primary_color = body.primary_color
    b.accent_color = body.accent_color
    b.logo_url = body.logo_url
    b.footer_text = body.footer_text
    b.updated_at = datetime.now(timezone.utc)
    b.updated_by = current_user.id
    db.commit()
    db.refresh(b)
    return b
