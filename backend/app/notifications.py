from typing import Optional

from sqlalchemy.orm import Session

from . import config
from .models.models import Notification


def create_notification(db: Session, *, user_id: int, ticket_id: Optional[str] = None, kind: str, message: str):
    # No-op regardless of caller when the feature is disabled — every write
    # site across tickets.py/comments.py/appointments.py/inbound_email.py
    # funnels through here, so this is the single gate.
    if not config.FEATURE_NOTIFICATIONS:
        return
    db.add(Notification(user_id=user_id, ticket_id=ticket_id, kind=kind, message=message))
