from typing import Optional

from sqlalchemy.orm import Session

from .models.models import AuditLog, User


def actor_of(current_user: Optional[User]) -> tuple[Optional[int], str]:
    if current_user is None:
        return None, "System"
    return current_user.id, current_user.name


def write_audit(
    db: Session,
    *,
    ticket_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    actor_id: Optional[int],
    actor_label: str,
    action: str,
    field: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
):
    db.add(AuditLog(
        ticket_id=ticket_id,
        invoice_id=invoice_id,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action,
        field=field,
        old_value=old_value,
        new_value=new_value,
    ))
