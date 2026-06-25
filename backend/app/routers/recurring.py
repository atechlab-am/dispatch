from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import RecurringTicket, User
from ..schemas import RecurringIn, RecurringOut
from ..security import get_current_user, require_admin

router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=list[RecurringOut])
def list_recurring(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(RecurringTicket).order_by(RecurringTicket.name).all()


@router.post("", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    body: RecurringIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..tasks import next_run_after
    r = RecurringTicket(
        **body.model_dump(),
        created_by=current_user.id,
        next_run=next_run_after(body.interval, datetime.now(timezone.utc)),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/{recurring_id}", response_model=RecurringOut)
def get_recurring(
    recurring_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = db.query(RecurringTicket).filter(RecurringTicket.id == recurring_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.put("/{recurring_id}", response_model=RecurringOut)
def update_recurring(
    recurring_id: int,
    body: RecurringIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from ..tasks import next_run_after
    r = db.query(RecurringTicket).filter(RecurringTicket.id == recurring_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    for field, val in body.model_dump().items():
        setattr(r, field, val)
    r.next_run = next_run_after(body.interval, datetime.now(timezone.utc))
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(
    recurring_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    r = db.query(RecurringTicket).filter(RecurringTicket.id == recurring_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
