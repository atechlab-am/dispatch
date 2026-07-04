from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Ticket, HourLog, User, ClientType
from ..security import get_current_user

router = APIRouter(prefix="/tickets/{ticket_id}/timer", tags=["timer"])

DEFAULT_RATES = {ClientType.residential: 85, ClientType.business: 110}


class TimerStartIn(BaseModel):
    rate: Optional[float] = None
    description: str = ""


class TimerOut(BaseModel):
    id: int
    ticket_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    is_running: bool
    hours: float
    rate: float
    description: str

    model_config = {"from_attributes": True}


def _get_ticket_or_404(ticket_id: str, db: Session) -> Ticket:
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


@router.post("", response_model=TimerOut, status_code=status.HTTP_201_CREATED)
def start_timer(
    ticket_id: str,
    body: TimerStartIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(ticket_id, db)
    existing = db.query(HourLog).filter(HourLog.ticket_id == ticket_id, HourLog.is_running == True).first()
    if existing:
        raise HTTPException(status_code=409, detail="A timer is already running on this ticket")

    rate = body.rate if body.rate is not None else DEFAULT_RATES.get(ticket.client_type, 110)
    now = datetime.now(timezone.utc)
    log = HourLog(
        ticket_id=ticket_id,
        date=now.date(),
        hours=0,
        rate=rate,
        description=body.description,
        started_at=now,
        is_running=True,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.post("/stop", response_model=TimerOut)
def stop_timer(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    log = db.query(HourLog).filter(HourLog.ticket_id == ticket_id, HourLog.is_running == True).first()
    if not log:
        raise HTTPException(status_code=404, detail="No running timer on this ticket")

    now = datetime.now(timezone.utc)
    started_at = log.started_at.replace(tzinfo=timezone.utc) if log.started_at.tzinfo is None else log.started_at
    elapsed_hours = (now - started_at).total_seconds() / 3600
    log.ended_at = now
    log.hours = round(elapsed_hours, 2)
    log.is_running = False
    db.commit()
    db.refresh(log)
    return log


@router.get("/active", response_model=Optional[TimerOut])
def get_active_timer(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    return db.query(HourLog).filter(HourLog.ticket_id == ticket_id, HourLog.is_running == True).first()
