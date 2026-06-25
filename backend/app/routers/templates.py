from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import TicketTemplate, User
from ..schemas import TemplateIn, TemplateOut
from ..security import get_current_user

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(TicketTemplate).order_by(TicketTemplate.name).all()


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = TicketTemplate(
        name=body.name,
        ticket_type=body.ticket_type,
        client_type=body.client_type,
        priority=body.priority,
        title=body.title,
        description=body.description,
        internal_notes=body.internal_notes,
        travel_fee=body.travel_fee,
        created_by=current_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    body: TemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(TicketTemplate).filter(TicketTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, val in body.model_dump().items():
        setattr(t, field, val)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(TicketTemplate).filter(TicketTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
