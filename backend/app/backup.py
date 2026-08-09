"""Backup Dispatch's database + uploads to a NAS over SMB, and restore from one.

A backup is a single .tar.gz archive containing:
  - db.dump      — `pg_dump -Fc` output (custom format, restorable via pg_restore)
  - uploads/     — a full copy of config.UPLOAD_DIR (attachments + document library)
  - manifest.json — created_at, app_version, db_bytes, uploads_bytes

Archives are named dispatch-backup-{YYYYMMDD-HHMMSS}.tar.gz and pushed to the
BACKUP_NAS_HOST/BACKUP_NAS_SHARE/BACKUP_NAS_PATH share over SMB2/3 via the
`smbclient` module — no CIFS mount, no elevated container privileges.

Every NAS-touching function is a thin wrapper so tests can mock subprocess
(pg_dump/pg_restore) and smbclient (the network) independently of each other.
"""
import json
import logging
import os
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import smbclient

from . import config

logger = logging.getLogger(__name__)

FILENAME_PREFIX = "dispatch-backup-"
FILENAME_SUFFIX = ".tar.gz"


@dataclass
class BackupResult:
    success: bool
    filename: Optional[str] = None
    size_bytes: Optional[int] = None
    error: str = ""


@dataclass
class BackupInfo:
    filename: str
    created_at: datetime
    size_bytes: int


def _nas_configured() -> bool:
    return bool(config.BACKUP_NAS_HOST and config.BACKUP_NAS_SHARE)


def _nas_username() -> str:
    if config.BACKUP_NAS_DOMAIN:
        return f"{config.BACKUP_NAS_DOMAIN}\\{config.BACKUP_NAS_USERNAME}"
    return config.BACKUP_NAS_USERNAME


def _register_session():
    smbclient.register_session(
        config.BACKUP_NAS_HOST,
        username=_nas_username() or None,
        password=config.BACKUP_NAS_PASSWORD or None,
    )


def _nas_dir() -> str:
    return f"\\\\{config.BACKUP_NAS_HOST}\\{config.BACKUP_NAS_SHARE}\\{config.BACKUP_NAS_PATH}"


def _nas_path(filename: str) -> str:
    return f"{_nas_dir()}\\{filename}"


def _db_connection_parts() -> dict:
    """Parse DATABASE_URL (postgresql://user:pass@host:port/dbname) into the
    pieces pg_dump/pg_restore need. Never logged — contains the password."""
    parsed = urlparse(config.DATABASE_URL)
    return {
        "user": parsed.username or "",
        "password": parsed.password or "",
        "host": parsed.hostname or "",
        "port": str(parsed.port or 5432),
        "dbname": (parsed.path or "/").lstrip("/"),
    }


def _pg_env(parts: dict) -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = parts["password"]
    return env


def _dump_database(dest_path: Path) -> None:
    parts = _db_connection_parts()
    subprocess.run(
        [
            "pg_dump", "-Fc",
            "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
            "-f", str(dest_path), parts["dbname"],
        ],
        env=_pg_env(parts), check=True, capture_output=True, text=True,
    )


def _restore_database(dump_path: Path) -> None:
    parts = _db_connection_parts()
    subprocess.run(
        [
            "pg_restore", "--clean", "--if-exists", "--no-owner",
            "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
            "-d", parts["dbname"], str(dump_path),
        ],
        env=_pg_env(parts), check=True, capture_output=True, text=True,
    )


def _dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _build_archive(archive_path: Path, work_dir: Path) -> dict:
    """Builds the backup archive at archive_path. Returns manifest data."""
    dump_path = work_dir / "db.dump"
    _dump_database(dump_path)

    uploads_dir = Path(config.UPLOAD_DIR)
    uploads_bytes = _dir_size_bytes(uploads_dir)
    db_bytes = dump_path.stat().st_size if dump_path.exists() else 0

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "app_version": _read_app_version(),
        "db_bytes": db_bytes,
        "uploads_bytes": uploads_bytes,
    }
    manifest_path = work_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(dump_path, arcname="db.dump")
        tar.add(manifest_path, arcname="manifest.json")
        if uploads_dir.exists():
            tar.add(uploads_dir, arcname="uploads")

    return manifest


def _read_app_version() -> str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "VERSION"
        if candidate.exists():
            return candidate.read_text().strip()
    return "unknown"


def _upload_to_nas(local_path: Path, filename: str) -> None:
    _register_session()
    try:
        smbclient.makedirs(_nas_dir(), exist_ok=True)
    except OSError:
        pass  # already exists
    with open(local_path, "rb") as src, smbclient.open_file(_nas_path(filename), mode="wb") as dst:
        shutil.copyfileobj(src, dst)


def _apply_retention() -> None:
    if config.BACKUP_RETENTION_COUNT <= 0:
        return
    try:
        names = [n for n in smbclient.listdir(_nas_dir()) if n.startswith(FILENAME_PREFIX) and n.endswith(FILENAME_SUFFIX)]
    except OSError:
        return
    names.sort(reverse=True)  # filenames are timestamp-sortable
    for stale in names[config.BACKUP_RETENTION_COUNT:]:
        try:
            smbclient.remove(_nas_path(stale))
        except OSError as e:
            logger.warning("Failed to prune old backup %s: %s", stale, e)


def run_backup() -> BackupResult:
    """Dump the DB + uploads, archive them, push to the NAS, and prune old
    backups beyond the retention count. Never raises — always returns a result."""
    if not _nas_configured():
        return BackupResult(success=False, error="Backup NAS is not configured (BACKUP_NAS_HOST/BACKUP_NAS_SHARE unset)")

    filename = f"{FILENAME_PREFIX}{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}{FILENAME_SUFFIX}"
    try:
        with tempfile.TemporaryDirectory(prefix="dispatch-backup-") as tmp:
            work_dir = Path(tmp)
            archive_path = work_dir / filename
            _build_archive(archive_path, work_dir)
            size_bytes = archive_path.stat().st_size
            _upload_to_nas(archive_path, filename)
        _apply_retention()
        return BackupResult(success=True, filename=filename, size_bytes=size_bytes)
    except Exception as e:
        logger.exception("Backup failed")
        return BackupResult(success=False, error=str(e))


def list_backups() -> list[BackupInfo]:
    """Newest-first list of backups currently on the NAS share."""
    if not _nas_configured():
        return []
    _register_session()
    try:
        names = [n for n in smbclient.listdir(_nas_dir()) if n.startswith(FILENAME_PREFIX) and n.endswith(FILENAME_SUFFIX)]
    except OSError:
        return []

    infos = []
    for name in names:
        ts_str = name[len(FILENAME_PREFIX):-len(FILENAME_SUFFIX)]
        try:
            created_at = datetime.strptime(ts_str, "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError:
            created_at = datetime.now(timezone.utc)
        try:
            size = smbclient.stat(_nas_path(name)).st_size
        except OSError:
            size = 0
        infos.append(BackupInfo(filename=name, created_at=created_at, size_bytes=size))

    infos.sort(key=lambda b: b.created_at, reverse=True)
    return infos


def download_backup(filename: str, dest_dir: Path) -> Path:
    """Pulls one archive down from the NAS into dest_dir, returns its local path."""
    _register_session()
    local_path = dest_dir / filename
    with smbclient.open_file(_nas_path(filename), mode="rb") as src, open(local_path, "wb") as dst:
        shutil.copyfileobj(src, dst)
    return local_path


def restore_backup(filename: str) -> None:
    """Destructive: downloads the named backup, restores the DB (--clean --if-exists
    drops and recreates existing objects), and replaces the entire uploads directory
    with the backup's contents. Raises on any failure — callers must handle this as
    the "app is about to become unavailable" signal it is."""
    with tempfile.TemporaryDirectory(prefix="dispatch-restore-") as tmp:
        work_dir = Path(tmp)
        archive_path = download_backup(filename, work_dir)

        extract_dir = work_dir / "extracted"
        extract_dir.mkdir()
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(extract_dir, filter="data")

        _restore_database(extract_dir / "db.dump")

        uploads_dir = Path(config.UPLOAD_DIR)
        backed_up_uploads = extract_dir / "uploads"
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        if backed_up_uploads.exists():
            shutil.copytree(backed_up_uploads, uploads_dir)
        else:
            uploads_dir.mkdir(parents=True, exist_ok=True)
