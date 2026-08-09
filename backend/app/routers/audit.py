from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import Ticket, AuditLog, User
from ..schemas import AuditLogOut
from ..security import get_current_user

router = APIRouter(prefix="/tickets/{ticket_id}/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_ticket_audit(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not config.FEATURE_AUDIT_LOG:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    if not db.query(Ticket).filter(Ticket.id == ticket_id).first():
        raise HTTPException(status_code=404, detail="Ticket not found")
    return (
        db.query(AuditLog)
        .filter(AuditLog.ticket_id == ticket_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
