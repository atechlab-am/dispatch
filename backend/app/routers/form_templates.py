"""Form template CRUD and per-ticket form instance endpoints.

Templates  (admin create/edit/delete; all authenticated users read):
  GET    /form-templates
  POST   /form-templates
  GET    /form-templates/{id}
  PUT    /form-templates/{id}
  DELETE /form-templates/{id}

Instances (per-ticket filled copies; any authenticated user):
  GET    /tickets/{ticket_id}/form-instances
  POST   /tickets/{ticket_id}/form-instances
  GET    /form-instances/{id}
  PUT    /form-instances/{id}
  DELETE /form-instances/{id}
"""

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import FormInstance, FormTemplate, Ticket, User
from ..security import get_current_user

router = APIRouter(tags=["form_templates"])

FIELD_TYPES = {"text", "textarea", "date", "checkbox"}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FieldDef(BaseModel):
    id: str = Field(..., max_length=64)           # slug, e.g. "scope_of_work"
    label: str = Field(..., max_length=255)
    type: str = Field(..., pattern=r"^(text|textarea|date|checkbox)$")
    required: bool = False
    placeholder: str = Field("", max_length=500)


class TemplateIn(BaseModel):
    name: str = Field(..., max_length=255)
    description: str = Field("", max_length=2000)
    ticket_types: list[str] = []
    fields: list[FieldDef] = []


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str
    ticket_types: list[str]
    fields: list[FieldDef]
    created_by: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_tmpl(cls, t: FormTemplate) -> "TemplateOut":
        return cls(
            id=t.id,
            name=t.name,
            description=t.description,
            ticket_types=[x.strip() for x in t.ticket_types.split(",") if x.strip()],
            fields=json.loads(t.fields) if t.fields else [],
            created_by=t.created_by,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


class InstanceIn(BaseModel):
    template_id: int
    values: dict = {}


class InstanceOut(BaseModel):
    id: int
    template_id: int
    ticket_id: str
    template_name: str
    fields: list[FieldDef]
    values: dict
    created_by: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_inst(cls, inst: FormInstance) -> "InstanceOut":
        tmpl = inst.template
        return cls(
            id=inst.id,
            template_id=inst.template_id,
            ticket_id=inst.ticket_id,
            template_name=tmpl.name if tmpl else "",
            fields=json.loads(tmpl.fields) if tmpl and tmpl.fields else [],
            values=json.loads(inst.values) if inst.values else {},
            created_by=inst.created_by,
            created_at=inst.created_at,
            updated_at=inst.updated_at,
        )


# ─── Template routes ──────────────────────────────────────────────────────────

@router.get("/form-templates", response_model=list[TemplateOut])
def list_templates(
    ticket_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    templates = db.query(FormTemplate).order_by(FormTemplate.name).all()
    result = []
    for t in templates:
        if ticket_type:
            types = [x.strip() for x in t.ticket_types.split(",") if x.strip()]
            if types and ticket_type not in types:
                continue
        result.append(TemplateOut.from_orm_tmpl(t))
    return result


@router.post("/form-templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    _validate_fields(body.fields)
    now = datetime.now(timezone.utc)
    tmpl = FormTemplate(
        name=body.name,
        description=body.description,
        ticket_types=",".join(body.ticket_types),
        fields=json.dumps([f.model_dump() for f in body.fields]),
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return TemplateOut.from_orm_tmpl(tmpl)


@router.get("/form-templates/{tmpl_id}", response_model=TemplateOut)
def get_template(tmpl_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    tmpl = _get_tmpl_or_404(tmpl_id, db)
    return TemplateOut.from_orm_tmpl(tmpl)


@router.put("/form-templates/{tmpl_id}", response_model=TemplateOut)
def update_template(
    tmpl_id: int,
    body: TemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    _validate_fields(body.fields)
    tmpl = _get_tmpl_or_404(tmpl_id, db)
    tmpl.name = body.name
    tmpl.description = body.description
    tmpl.ticket_types = ",".join(body.ticket_types)
    tmpl.fields = json.dumps([f.model_dump() for f in body.fields])
    tmpl.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tmpl)
    return TemplateOut.from_orm_tmpl(tmpl)


@router.delete("/form-templates/{tmpl_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    tmpl = _get_tmpl_or_404(tmpl_id, db)
    db.delete(tmpl)
    db.commit()


# ─── Instance routes ──────────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/form-instances", response_model=list[InstanceOut])
def list_instances(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    instances = (
        db.query(FormInstance)
        .filter(FormInstance.ticket_id == ticket_id)
        .order_by(FormInstance.created_at)
        .all()
    )
    return [InstanceOut.from_orm_inst(i) for i in instances]


@router.post("/tickets/{ticket_id}/form-instances", response_model=InstanceOut, status_code=status.HTTP_201_CREATED)
def create_instance(
    ticket_id: str,
    body: InstanceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_ticket_or_404(ticket_id, db)
    tmpl = _get_tmpl_or_404(body.template_id, db)
    now = datetime.now(timezone.utc)
    inst = FormInstance(
        template_id=tmpl.id,
        ticket_id=ticket_id,
        values=json.dumps(body.values),
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return InstanceOut.from_orm_inst(inst)


@router.get("/form-instances/{inst_id}", response_model=InstanceOut)
def get_instance(inst_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    inst = _get_inst_or_404(inst_id, db)
    return InstanceOut.from_orm_inst(inst)


@router.put("/form-instances/{inst_id}", response_model=InstanceOut)
def update_instance(
    inst_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inst = _get_inst_or_404(inst_id, db)
    inst.values = json.dumps(body)
    inst.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inst)
    return InstanceOut.from_orm_inst(inst)


@router.delete("/form-instances/{inst_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_instance(
    inst_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inst = _get_inst_or_404(inst_id, db)
    db.delete(inst)
    db.commit()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_tmpl_or_404(tmpl_id: int, db: Session) -> FormTemplate:
    tmpl = db.query(FormTemplate).filter(FormTemplate.id == tmpl_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Form template not found")
    return tmpl


def _get_inst_or_404(inst_id: int, db: Session) -> FormInstance:
    inst = db.query(FormInstance).filter(FormInstance.id == inst_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Form instance not found")
    return inst


def _get_ticket_or_404(ticket_id: str, db: Session) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


def _validate_fields(fields: list[FieldDef]) -> None:
    ids = [f.id for f in fields]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Field IDs must be unique within a template")
