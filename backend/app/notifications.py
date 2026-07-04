from typing import Optional

from sqlalchemy.orm import Session

from .models.models import Notification


def create_notification(db: Session, *, user_id: int, ticket_id: Optional[str] = None, kind: str, message: str):
    db.add(Notification(user_id=user_id, ticket_id=ticket_id, kind=kind, message=message))
