from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, UserRole
from ..schemas import UserOut
from ..security import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/users", tags=["users"])


class UserCreateIn(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "technician"


class UserUpdateIn(BaseModel):
    name: str
    email: EmailStr
    role: str
    active: bool
    password: str = ""


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}")

    user.name = body.name
    user.email = body.email
    user.role = role
    user.active = body.active
    if body.password:
        user.password_hash = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.active = False
    db.commit()


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_own_password(
    body: PasswordChangeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..security import verify_password
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
