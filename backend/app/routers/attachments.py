import os
import uuid
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Ticket, TicketAttachment, User
from ..schemas import AttachmentOut
from ..security import get_current_user
from .. import config

router = APIRouter(tags=["attachments"])

UPLOAD_DIR = Path(config.UPLOAD_DIR)
MAX_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
}


def _get_ticket_or_404(ticket_id: str, db: Session) -> Ticket:
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


@router.get("/tickets/{ticket_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    return db.query(TicketAttachment).filter(
        TicketAttachment.ticket_id == ticket_id
    ).order_by(TicketAttachment.created_at).all()


@router.post(
    "/tickets/{ticket_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"File type not allowed: {mime}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = Path(file.filename or "file").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    ticket_dir = UPLOAD_DIR / ticket_id
    ticket_dir.mkdir(parents=True, exist_ok=True)
    dest = ticket_dir / stored_name
    dest.write_bytes(contents)

    att = TicketAttachment(
        ticket_id=ticket_id,
        filename=stored_name,
        original_name=file.filename or stored_name,
        mime_type=mime,
        size=len(contents),
        uploaded_by=current_user.id,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    att = db.query(TicketAttachment).filter(TicketAttachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = UPLOAD_DIR / att.ticket_id / att.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=str(path),
        media_type=att.mime_type,
        filename=att.original_name,
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(TicketAttachment).filter(TicketAttachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if att.uploaded_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    path = UPLOAD_DIR / att.ticket_id / att.filename
    if path.exists():
        path.unlink()

    db.delete(att)
    db.commit()
