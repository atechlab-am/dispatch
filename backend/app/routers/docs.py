"""In-app documentation viewer.

GET /api/docs — list available doc pages.
GET /api/docs/{slug} — raw Markdown content of one page.
Serves the same docs/*.md files shipped in the repo (COPY'd into the image at build time),
so content matches the version actually running rather than whatever's on GitHub.
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..security import get_current_user
from ..models.models import User

router = APIRouter(prefix="/docs", tags=["docs"])

# slug -> (title, filename). Fixed allowlist — slugs never come from user input,
# so there's no path-traversal surface reading these files.
PAGES = {
    "getting-started": ("Getting Started", "getting-started.md"),
    "features": ("Features", "features.md"),
    "operations": ("Operations", "operations.md"),
}


def _find_docs_dir() -> Path:
    """Walk up from this file until we find a docs/ dir, or fall back to /app/docs."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        candidate = parent / "docs"
        if candidate.is_dir():
            return candidate
    return Path("/app/docs")


_DOCS_DIR = _find_docs_dir()


class DocPageOut(BaseModel):
    slug: str
    title: str


class DocContentOut(BaseModel):
    slug: str
    title: str
    content: str


@router.get("", response_model=list[DocPageOut])
def list_docs(_: User = Depends(get_current_user)):
    return [DocPageOut(slug=slug, title=title) for slug, (title, _file) in PAGES.items()]


@router.get("/{slug}", response_model=DocContentOut)
def get_doc(slug: str, _: User = Depends(get_current_user)):
    page = PAGES.get(slug)
    if not page:
        raise HTTPException(status_code=404, detail="Doc page not found")
    title, filename = page
    try:
        content = (_DOCS_DIR / filename).read_text()
    except OSError:
        raise HTTPException(status_code=404, detail="Doc page not found")
    return DocContentOut(slug=slug, title=title, content=content)
