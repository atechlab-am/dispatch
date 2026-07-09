from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Material, User
from ..security import get_current_user, require_admin
from .. import config

router = APIRouter(prefix="/materials", tags=["materials"])


def _require_enabled():
    if not config.FEATURE_MATERIALS:
        raise HTTPException(status_code=503, detail="This feature is disabled")


class MaterialIn(BaseModel):
    name: str = Field(..., max_length=255)
    description: str = Field("", max_length=500)
    unit_price: float = 0


class MaterialOut(BaseModel):
    id: int
    name: str
    description: str
    unit_price: float
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("", response_model=list[MaterialOut])
def list_materials(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Any authenticated staff can read the catalog — it's searched from quote
    line items to autofill price. Only admins can manage (create/update/delete) it."""
    _require_enabled()
    return db.query(Material).order_by(Material.name).all()


@router.post("", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(
    body: MaterialIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _require_enabled()
    m = Material(
        name=body.name,
        description=body.description,
        unit_price=body.unit_price,
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(
    material_id: int,
    body: MaterialIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    m = db.query(Material).filter(Material.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    m.name = body.name
    m.description = body.description
    m.unit_price = body.unit_price
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    m = db.query(Material).filter(Material.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(m)
    db.commit()
