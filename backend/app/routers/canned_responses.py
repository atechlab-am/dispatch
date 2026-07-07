from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import CannedResponse, User
from ..security import get_current_user, require_admin
from .. import config

router = APIRouter(prefix="/canned-responses", tags=["canned-responses"])


def _require_enabled():
    if not config.FEATURE_CANNED_RESPONSES:
        raise HTTPException(status_code=503, detail="This feature is disabled")


class CannedResponseIn(BaseModel):
    name: str = Field(..., max_length=255)
    body: str = Field("", max_length=5000)


class CannedResponseOut(BaseModel):
    id: int
    name: str
    body: str
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("", response_model=list[CannedResponseOut])
def list_canned_responses(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Any authenticated staff can read the library — techs need these to insert
    into comments. Only admins can manage (create/update/delete) it."""
    _require_enabled()
    return db.query(CannedResponse).order_by(CannedResponse.name).all()


@router.post("", response_model=CannedResponseOut, status_code=status.HTTP_201_CREATED)
def create_canned_response(
    body: CannedResponseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _require_enabled()
    r = CannedResponse(
        name=body.name,
        body=body.body,
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/{response_id}", response_model=CannedResponseOut)
def update_canned_response(
    response_id: int,
    body: CannedResponseIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    r = db.query(CannedResponse).filter(CannedResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Canned response not found")
    r.name = body.name
    r.body = body.body
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_canned_response(
    response_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    r = db.query(CannedResponse).filter(CannedResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Canned response not found")
    db.delete(r)
    db.commit()
