import os
import uuid
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Document, User
from ..security import get_current_user
from .. import config

router = APIRouter(prefix="/documents", tags=["documents"])

UPLOAD_DIR = Path(config.UPLOAD_DIR) / "documents"
MAX_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/jpeg",
    "image/png",
}

CATEGORIES = {
    "assessment_diagnostic",
    "setup_implementation",
    "migration",
    "recurring_retainer",
    "on_demand_support",
    "specialized_infrastructure",
    "policy_fee",
    "client_facing",
    "requires_signature",
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    name: str
    description: str
    category: str
    ticket_types: list[str]
    tags: list[str]
    requires_signature: bool
    original_name: str
    mime_type: str
    size: int
    uploaded_by: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_doc(cls, doc: Document) -> "DocumentOut":
        return cls(
            id=doc.id,
            name=doc.name,
            description=doc.description,
            category=doc.category,
            ticket_types=[t.strip() for t in doc.ticket_types.split(",") if t.strip()],
            tags=[t.strip() for t in doc.tags.split(",") if t.strip()],
            requires_signature=doc.requires_signature,
            original_name=doc.original_name,
            mime_type=doc.mime_type,
            size=doc.size,
            uploaded_by=doc.uploaded_by,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )


class DocumentUpdate(BaseModel):
    name: str = Field(..., max_length=255)
    description: str = Field("", max_length=2000)
    category: str = Field("on_demand_support", max_length=60)
    ticket_types: list[str] = []
    tags: list[str] = []
    requires_signature: bool = False


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DocumentOut])
def list_documents(
    category: Optional[str] = Query(None),
    ticket_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    docs = db.query(Document).order_by(Document.name).all()
    result = []
    for doc in docs:
        if category and doc.category != category:
            continue
        if ticket_type:
            types = [t.strip() for t in doc.ticket_types.split(",") if t.strip()]
            # empty ticket_types means "all types"
            if types and ticket_type not in types:
                continue
        result.append(DocumentOut.from_orm_doc(doc))
    return result


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    name: str = Query(..., max_length=255),
    description: str = Query("", max_length=2000),
    category: str = Query("on_demand_support", max_length=60),
    ticket_types: str = Query(""),   # comma-separated
    tags: str = Query(""),           # comma-separated
    requires_signature: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category must be one of {sorted(CATEGORIES)}")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"File type not allowed: {mime}")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / stored_name).write_bytes(contents)

    now = datetime.now(timezone.utc)
    doc = Document(
        name=name,
        description=description,
        category=category,
        ticket_types=ticket_types,
        tags=tags,
        requires_signature=requires_signature,
        filename=stored_name,
        original_name=file.filename or stored_name,
        mime_type=mime,
        size=len(contents),
        uploaded_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_doc(doc)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut.from_orm_doc(doc)


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(
    doc_id: int,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category must be one of {sorted(CATEGORIES)}")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.name = body.name
    doc.description = body.description
    doc.category = body.category
    doc.ticket_types = ",".join(body.ticket_types)
    doc.tags = ",".join(body.tags)
    doc.requires_signature = body.requires_signature
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.from_orm_doc(doc)


@router.get("/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = UPLOAD_DIR / doc.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=str(path), media_type=doc.mime_type, filename=doc.original_name)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = UPLOAD_DIR / doc.filename
    if path.exists():
        path.unlink()
    db.delete(doc)
    db.commit()
