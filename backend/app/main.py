import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError

from . import database as _db
from .models.models import RefreshToken
from .routers import auth, tickets, users, setup, clients, invoices, dashboard, comments, templates, attachments, recurring, documents, reports
from .tasks import recurring_ticket_loop
from . import config


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
        })


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    # Quieten noisy uvicorn access logger — still goes through our formatter
    logging.getLogger("uvicorn.access").propagate = True


logger = logging.getLogger(__name__)


def _validate_secret_key():
    key = config.SECRET_KEY or ""
    placeholders = {"changeme", "secret", "your-secret-key", "change-this"}
    if not key or len(key) < 32 or key.lower() in placeholders:
        raise RuntimeError(
            "SECRET_KEY is missing, too short, or is a placeholder. "
            "Generate one with: openssl rand -hex 32"
        )


async def _purge_expired_tokens_loop():
    while True:
        try:
            with _db.SessionLocal() as db:
                deleted = (
                    db.query(RefreshToken)
                    .filter(RefreshToken.expires_at < datetime.now(timezone.utc))
                    .delete(synchronize_session=False)
                )
                db.commit()
                if deleted:
                    logger.info("Purged %d expired refresh tokens", deleted)
        except Exception:
            logger.exception("Failed to purge expired refresh tokens")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    _validate_secret_key()
    task = asyncio.create_task(_purge_expired_tokens_loop())
    task2 = asyncio.create_task(recurring_ticket_loop())
    yield
    task.cancel()
    task2.cancel()
    for t in (task, task2):
        try:
            await t
        except asyncio.CancelledError:
            pass


limiter = Limiter(key_func=get_remote_address, default_limits=[])

app = FastAPI(title="Dispatch API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(recurring.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/health")
def health():
    try:
        with _db.SessionLocal() as db:
            db.execute(_db.text("SELECT 1"))
        return {"ok": True}
    except SQLAlchemyError as exc:
        logger.error("Health check DB error: %s", exc)
        return JSONResponse({"ok": False, "error": "db_unavailable"}, status_code=503)
