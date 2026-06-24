from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import database as _db
from .models.models import Base
from .routers import auth, tickets, users
from . import config


def _seed_admin(db):
    from .models.models import User, UserRole
    from .security import hash_password

    if not config.FIRST_ADMIN_PASSWORD:
        return

    existing = db.query(User).filter(User.email == config.FIRST_ADMIN_EMAIL).first()
    if existing:
        return

    db.add(User(
        email=config.FIRST_ADMIN_EMAIL,
        name=config.FIRST_ADMIN_NAME,
        password_hash=hash_password(config.FIRST_ADMIN_PASSWORD),
        role=UserRole.admin,
    ))
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=_db.engine)
    db = _db.SessionLocal()
    try:
        _seed_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Dispatch API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(users.router, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True}
