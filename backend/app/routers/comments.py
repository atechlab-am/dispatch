from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Ticket, TicketComment, User
from ..schemas import CommentIn, CommentOut
from ..security import get_current_user
from .. import email as mailer
from ..notifications import create_notification

router = APIRouter(prefix="/tickets/{ticket_id}/comments", tags=["comments"])


def _get_ticket_or_404(ticket_id: str, db: Session) -> Ticket:
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


@router.get("", response_model=list[CommentOut])
def list_comments(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    rows = (
        db.query(TicketComment, User.name.label("author_name"))
        .join(User, TicketComment.author_id == User.id)
        .filter(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at)
        .all()
    )
    result = []
    for c, author_name in rows:
        result.append(CommentOut(
            id=c.id,
            ticket_id=c.ticket_id,
            author_id=c.author_id,
            author_name=author_name,
            body=c.body,
            is_internal=c.is_internal,
            created_at=c.created_at,
        ))
    return result


@router.post("", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    ticket_id: str,
    body: CommentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(ticket_id, db)
    comment = TicketComment(
        ticket_id=ticket_id,
        author_id=current_user.id,
        body=body.body,
        is_internal=body.is_internal,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    if not body.is_internal and ticket.client_email:
        mailer.notify_comment_added(
            ticket_id=ticket_id,
            title=ticket.title,
            comment_body=body.body,
            author_name=current_user.name,
            client_email=ticket.client_email,
        )

    if body.is_internal and ticket.assigned_to and ticket.assigned_to != current_user.id:
        create_notification(
            db, user_id=ticket.assigned_to, ticket_id=ticket_id, kind="comment_added",
            message=f"{current_user.name} commented on ticket {ticket_id}: {ticket.title}",
        )
        db.commit()

    return CommentOut(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_id=comment.author_id,
        author_name=current_user.name,
        body=comment.body,
        is_internal=comment.is_internal,
        created_at=comment.created_at,
    )


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    ticket_id: str,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    comment = db.query(TicketComment).filter(
        TicketComment.id == comment_id,
        TicketComment.ticket_id == ticket_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(comment)
    db.commit()
