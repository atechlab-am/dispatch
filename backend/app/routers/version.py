"""Version check endpoint.

GET /api/version/check — returns current running version and latest GitHub release.
Requires GITHUB_REPO (owner/repo) and GITHUB_TOKEN in env.
Result is cached for 10 minutes to avoid hammering the GitHub API.
"""

import logging
import time
import urllib.request
import urllib.error
import json
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..security import get_current_user
from ..models.models import User
from .. import config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/version", tags=["version"])

def _find_version_file() -> Path:
    """Walk up from this file until we find VERSION, or fall back to /app/VERSION."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        candidate = parent / "VERSION"
        if candidate.exists():
            return candidate
    return Path("/app/VERSION")

_VERSION_FILE = _find_version_file()
_CACHE: dict = {"ts": 0.0, "data": None}
_CACHE_TTL = 600  # 10 minutes


def _read_current_version() -> str:
    try:
        return _VERSION_FILE.read_text().strip()
    except Exception:
        return "unknown"


def _fetch_latest_release() -> dict | None:
    """Fetch latest release from GitHub API. Returns None if not configured or on error."""
    if not config.GITHUB_REPO or not config.GITHUB_TOKEN:
        return None

    url = f"https://api.github.com/repos/{config.GITHUB_REPO}/releases/latest"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {config.GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "dispatch-version-check/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.warning("GitHub releases API returned %s for %s", e.code, config.GITHUB_REPO)
        return None
    except Exception as e:
        logger.warning("Failed to fetch GitHub release: %s", e)
        return None


def _semver_gt(a: str, b: str) -> bool:
    """Return True if version string a is strictly greater than b."""
    def parts(v: str):
        v = v.lstrip("v")
        try:
            return tuple(int(x) for x in v.split(".")[:3])
        except ValueError:
            return (0, 0, 0)
    return parts(a) > parts(b)


class VersionOut(BaseModel):
    current: str
    latest: str | None
    update_available: bool
    release_url: str | None
    release_name: str | None
    configured: bool   # False when GITHUB_REPO/GITHUB_TOKEN not set


@router.get("/check", response_model=VersionOut)
def check_version(_: User = Depends(get_current_user)):
    current = _read_current_version()

    if not config.GITHUB_REPO or not config.GITHUB_TOKEN:
        return VersionOut(
            current=current,
            latest=None,
            update_available=False,
            release_url=None,
            release_name=None,
            configured=False,
        )

    now = time.monotonic()
    if now - _CACHE["ts"] > _CACHE_TTL or _CACHE["data"] is None:
        _CACHE["data"] = _fetch_latest_release()
        _CACHE["ts"] = now

    release = _CACHE["data"]
    if not release:
        return VersionOut(
            current=current,
            latest=None,
            update_available=False,
            release_url=None,
            release_name=None,
            configured=True,
        )

    latest_tag = release.get("tag_name", "")
    latest_clean = latest_tag.lstrip("v")
    update_available = _semver_gt(latest_clean, current)

    return VersionOut(
        current=current,
        latest=latest_clean,
        update_available=update_available,
        release_url=release.get("html_url"),
        release_name=release.get("name") or latest_tag,
        configured=True,
    )
