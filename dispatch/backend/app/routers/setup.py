from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, UserRole
from ..security import hash_password

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupIn(BaseModel):
    name: str
    email: EmailStr
    password: str


def _admin_exists(db: Session) -> bool:
    return db.query(User).filter(User.role == UserRole.admin).first() is not None


@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    return {"needs_setup": not _admin_exists(db)}


@router.post("/complete", status_code=status.HTTP_201_CREATED)
def setup_complete(body: SetupIn, db: Session = Depends(get_db)):
    if _admin_exists(db):
        raise HTTPException(status_code=409, detail="Setup already complete")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.admin,
    )
    db.add(user)
    db.commit()
    return {"ok": True}
