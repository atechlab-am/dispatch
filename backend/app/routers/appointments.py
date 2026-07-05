from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import Appointment, Ticket, User
from ..schemas import AppointmentIn, AppointmentOut
from ..security import get_current_user
from ..audit import write_audit
from ..notifications import create_notification

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _to_out(a: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=a.id,
        ticket_id=a.ticket_id,
        technician_id=a.technician_id,
        start_at=a.start_at,
        end_at=a.end_at,
        notes=a.notes,
        created_by=a.created_by,
        created_at=a.created_at,
        ticket_title=a.ticket.title if a.ticket else "",
        technician_name=a.technician.name if a.technician else "",
    )


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    start: datetime = Query(...),
    end: datetime = Query(...),
    technician_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not config.FEATURE_SCHEDULING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    q = db.query(Appointment).filter(
        Appointment.start_at < end,
        Appointment.end_at > start,
    )
    if technician_id:
        q = q.filter(Appointment.technician_id == technician_id)
    return [_to_out(a) for a in q.order_by(Appointment.start_at).all()]


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    body: AppointmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_SCHEDULING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    ticket = db.query(Ticket).filter(Ticket.id == body.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at")

    appt = Appointment(
        ticket_id=body.ticket_id,
        technician_id=body.technician_id,
        start_at=body.start_at,
        end_at=body.end_at,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(appt)
    db.flush()

    technician = db.query(User).filter(User.id == body.technician_id).first()
    create_notification(
        db, user_id=body.technician_id, ticket_id=ticket.id, kind="appointment_scheduled",
        message=f"You've been scheduled for {ticket.title} on {body.start_at:%b %d, %H:%M}",
    )
    write_audit(
        db, ticket_id=ticket.id, actor_id=current_user.id, actor_label=current_user.name,
        action="appointment_scheduled",
        new_value=f"{body.start_at.isoformat()} – {technician.name if technician else body.technician_id}",
    )
    db.commit()
    db.refresh(appt)
    return _to_out(appt)


@router.put("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: int,
    body: AppointmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_SCHEDULING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at")

    old_start, old_technician_id = appt.start_at, appt.technician_id
    old_technician = db.query(User).filter(User.id == old_technician_id).first()

    appt.ticket_id = body.ticket_id
    appt.technician_id = body.technician_id
    appt.start_at = body.start_at
    appt.end_at = body.end_at
    appt.notes = body.notes
    db.flush()

    new_technician = db.query(User).filter(User.id == body.technician_id).first()
    write_audit(
        db, ticket_id=appt.ticket_id, actor_id=current_user.id, actor_label=current_user.name,
        action="appointment_rescheduled", field="appointment",
        old_value=f"{old_start.isoformat()} – {old_technician.name if old_technician else old_technician_id}",
        new_value=f"{body.start_at.isoformat()} – {new_technician.name if new_technician else body.technician_id}",
    )
    if body.technician_id != old_technician_id:
        create_notification(
            db, user_id=body.technician_id, ticket_id=appt.ticket_id, kind="appointment_scheduled",
            message=f"You've been scheduled for a rescheduled appointment on {body.start_at:%b %d, %H:%M}",
        )
    db.commit()
    db.refresh(appt)
    return _to_out(appt)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_SCHEDULING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    technician = db.query(User).filter(User.id == appt.technician_id).first()
    write_audit(
        db, ticket_id=appt.ticket_id, actor_id=current_user.id, actor_label=current_user.name,
        action="appointment_cancelled",
        old_value=f"{appt.start_at.isoformat()} – {technician.name if technician else appt.technician_id}",
    )
    db.delete(appt)
    db.commit()
