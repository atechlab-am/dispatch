from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Client, ClientType
from ..security import get_current_user

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientIn(BaseModel):
    name: str = Field(..., max_length=255)
    email: str = Field("", max_length=255)
    phone: str = Field("", max_length=50)
    address: str = Field("", max_length=500)
    client_type: str = "business"
    company: str = Field("", max_length=255)
    notes: str = Field("", max_length=5000)


class ClientOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    address: str
    client_type: str
    company: str
    notes: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return db.query(Client).order_by(Client.name).all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    body: ClientIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        ct = ClientType(body.client_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid client_type: {body.client_type}")

    client = Client(
        name=body.name, email=body.email, phone=body.phone,
        address=body.address, client_type=ct, company=body.company,
        notes=body.notes,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    body: ClientIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    try:
        ct = ClientType(body.client_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid client_type: {body.client_type}")

    client.name = body.name
    client.email = body.email
    client.phone = body.phone
    client.address = body.address
    client.client_type = ct
    client.company = body.company
    client.notes = body.notes
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
