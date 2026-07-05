from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import Notification, User
from ..schemas import NotificationOut
from ..security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_NOTIFICATIONS:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.read == False)
    return q.order_by(Notification.created_at.desc()).limit(50).all()


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_NOTIFICATIONS:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False,
    ).count()
    return {"count": count}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_NOTIFICATIONS:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    db.commit()
    db.refresh(n)
    return n


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not config.FEATURE_NOTIFICATIONS:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False,
    ).update({"read": True}, synchronize_session=False)
    db.commit()
