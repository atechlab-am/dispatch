from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import TicketDocument, Document, Ticket, User
from ..security import get_current_user

router = APIRouter(tags=["ticket_documents"])


class TicketDocOut(BaseModel):
    id: int
    ticket_id: str
    document_id: int
    document_name: str
    document_category: str
    requires_signature: bool
    acknowledged: bool
    signature_obtained: bool
    noted_by: Optional[int]
    noted_at: Optional[datetime]
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_td(cls, td: TicketDocument, doc: Document) -> "TicketDocOut":
        return cls(
            id=td.id,
            ticket_id=td.ticket_id,
            document_id=td.document_id,
            document_name=doc.name,
            document_category=doc.category,
            requires_signature=doc.requires_signature,
            acknowledged=td.acknowledged,
            signature_obtained=td.signature_obtained,
            noted_by=td.noted_by,
            noted_at=td.noted_at,
        )


class TicketDocUpdate(BaseModel):
    acknowledged: bool
    signature_obtained: bool


@router.get("/tickets/{ticket_id}/documents", response_model=list[TicketDocOut])
def list_ticket_documents(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tds = db.query(TicketDocument).filter(TicketDocument.ticket_id == ticket_id).all()
    result = []
    for td in tds:
        doc = db.query(Document).filter(Document.id == td.document_id).first()
        if doc:
            result.append(TicketDocOut.from_orm_td(td, doc))
    return result


@router.post("/tickets/{ticket_id}/documents", response_model=TicketDocOut, status_code=status.HTTP_201_CREATED)
def attach_document(
    ticket_id: str,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    existing = db.query(TicketDocument).filter(
        TicketDocument.ticket_id == ticket_id,
        TicketDocument.document_id == document_id,
    ).first()
    if existing:
        return TicketDocOut.from_orm_td(existing, doc)
    td = TicketDocument(
        ticket_id=ticket_id,
        document_id=document_id,
        acknowledged=False,
        signature_obtained=False,
        noted_by=current_user.id,
        noted_at=datetime.now(timezone.utc),
    )
    db.add(td)
    db.commit()
    db.refresh(td)
    return TicketDocOut.from_orm_td(td, doc)


@router.patch("/tickets/{ticket_id}/documents/{doc_id}", response_model=TicketDocOut)
def update_ticket_document(
    ticket_id: str,
    doc_id: int,
    body: TicketDocUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    td = db.query(TicketDocument).filter(
        TicketDocument.ticket_id == ticket_id,
        TicketDocument.document_id == doc_id,
    ).first()
    if not td:
        raise HTTPException(status_code=404, detail="Not found")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    td.acknowledged = body.acknowledged
    td.signature_obtained = body.signature_obtained
    td.noted_by = current_user.id
    td.noted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(td)
    return TicketDocOut.from_orm_td(td, doc)


@router.delete("/tickets/{ticket_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def detach_document(
    ticket_id: str,
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    td = db.query(TicketDocument).filter(
        TicketDocument.ticket_id == ticket_id,
        TicketDocument.document_id == doc_id,
    ).first()
    if not td:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(td)
    db.commit()
