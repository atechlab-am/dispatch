import os
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import BackupRun, User
from ..security import require_admin, verify_password
from .. import backup as backup_module
from .. import config

router = APIRouter(prefix="/backups", tags=["backups"])


def _require_enabled():
    if not config.FEATURE_BACKUPS:
        raise HTTPException(status_code=503, detail="This feature is disabled")


class BackupRunOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: Optional[datetime]
    status: str
    filename: Optional[str]
    size_bytes: Optional[int]
    error: str
    triggered_by: str
    model_config = {"from_attributes": True}


class BackupRunsPage(BaseModel):
    items: list[BackupRunOut]
    total: int


class AvailableBackupOut(BaseModel):
    filename: str
    created_at: datetime
    size_bytes: int


@router.get("", response_model=BackupRunsPage)
def list_backup_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    q = db.query(BackupRun).order_by(BackupRun.started_at.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return BackupRunsPage(items=items, total=total)


def _run_manual_backup_in_background(run_id: int):
    from ..database import SessionLocal
    with SessionLocal() as db:
        run = db.query(BackupRun).filter(BackupRun.id == run_id).first()
        if not run:
            return
        result = backup_module.run_backup()
        run.status = "success" if result.success else "failed"
        run.filename = result.filename
        run.size_bytes = result.size_bytes
        run.error = result.error
        run.finished_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/run", response_model=BackupRunOut, status_code=status.HTTP_202_ACCEPTED)
def trigger_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Starts a backup in the background and returns immediately — a full DB
    dump can take a while. Poll GET /backups for the run's outcome."""
    _require_enabled()
    run = BackupRun(status="running", triggered_by="manual")
    db.add(run)
    db.commit()
    db.refresh(run)

    threading.Thread(target=_run_manual_backup_in_background, args=(run.id,), daemon=True).start()
    return run


@router.get("/available", response_model=list[AvailableBackupOut])
def list_available_backups(_: User = Depends(require_admin)):
    """Lists backups actually present on the NAS share (live network call,
    unlike GET /backups which only reads local history)."""
    _require_enabled()
    return backup_module.list_backups()


class RestoreIn(BaseModel):
    filename: str
    password: str


@router.post("/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_from_backup(
    body: RestoreIn,
    current_user: User = Depends(require_admin),
):
    """Destructive: overwrites the live database and uploads directory with
    the named backup's contents, then exits the process so Docker's
    `restart: unless-stopped` brings the backend back up cleanly against the
    restored data. The app is briefly unavailable while this happens — no
    request can safely keep being served through a mid-flight DB replacement."""
    _require_enabled()
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    backup_module.restore_backup(body.filename)

    def _exit_soon():
        os._exit(0)

    threading.Timer(1.0, _exit_soon).start()
