import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Material, User
from ..security import get_current_user, require_admin
from .. import config

MAX_IMPORT_SIZE = 2 * 1024 * 1024  # 2 MB — a materials catalog is a short list, not a data dump
MAX_IMPORT_ROWS = 5000
REQUIRED_COLUMNS = {"name"}
KNOWN_COLUMNS = {"name", "description", "unit_price"}

router = APIRouter(prefix="/materials", tags=["materials"])


def _require_enabled():
    if not config.FEATURE_MATERIALS:
        raise HTTPException(status_code=503, detail="This feature is disabled")


class MaterialIn(BaseModel):
    name: str = Field(..., max_length=255)
    description: str = Field("", max_length=500)
    unit_price: float = 0


class MaterialOut(BaseModel):
    id: int
    name: str
    description: str
    unit_price: float
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("", response_model=list[MaterialOut])
def list_materials(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Any authenticated staff can read the catalog — it's searched from quote
    line items to autofill price. Only admins can manage (create/update/delete) it."""
    _require_enabled()
    return db.query(Material).order_by(Material.name).all()


@router.post("", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(
    body: MaterialIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _require_enabled()
    m = Material(
        name=body.name,
        description=body.description,
        unit_price=body.unit_price,
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


class ImportRowError(BaseModel):
    row: int  # 1-based, counting the header as row 1 so it matches what a user sees in a spreadsheet
    message: str


class ImportResult(BaseModel):
    created: int
    errors: list[ImportRowError]


def _parse_unit_price(raw: str) -> float:
    cleaned = raw.strip().lstrip("$").replace(",", "")
    return float(cleaned)


@router.post("/import", response_model=ImportResult)
async def import_materials_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Bulk-create materials from a CSV with a header row containing at least
    `name` (description and unit_price are optional, default to "" and 0).
    Validates every row before writing anything — a single bad file can't
    half-import. Unknown columns are ignored; row numbers in the response
    count the header as row 1, matching what a user sees in a spreadsheet."""
    _require_enabled()

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 2 MB limit")

    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    header = {h.strip().lower() for h in reader.fieldnames if h}
    missing = REQUIRED_COLUMNS - header
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required column(s): {', '.join(sorted(missing))}")

    rows = list(reader)
    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"Too many rows (max {MAX_IMPORT_ROWS})")

    to_create: list[Material] = []
    errors: list[ImportRowError] = []
    now = datetime.now(timezone.utc)

    for i, raw_row in enumerate(rows):
        row_num = i + 2  # header is row 1, first data row is row 2
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}

        name = row.get("name", "")
        if not name:
            errors.append(ImportRowError(row=row_num, message="Missing name"))
            continue
        if len(name) > 255:
            errors.append(ImportRowError(row=row_num, message="Name exceeds 255 characters"))
            continue

        description = row.get("description", "")
        if len(description) > 500:
            errors.append(ImportRowError(row=row_num, message="Description exceeds 500 characters"))
            continue

        unit_price_raw = row.get("unit_price", "")
        unit_price = 0.0
        if unit_price_raw:
            try:
                unit_price = _parse_unit_price(unit_price_raw)
            except ValueError:
                errors.append(ImportRowError(row=row_num, message=f"Invalid unit_price: {unit_price_raw!r}"))
                continue
        if unit_price < 0:
            errors.append(ImportRowError(row=row_num, message="unit_price cannot be negative"))
            continue

        to_create.append(Material(
            name=name,
            description=description,
            unit_price=unit_price,
            created_by=current_user.id,
            created_at=now,
        ))

    for m in to_create:
        db.add(m)
    db.commit()

    return ImportResult(created=len(to_create), errors=errors)


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(
    material_id: int,
    body: MaterialIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    m = db.query(Material).filter(Material.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    m.name = body.name
    m.description = body.description
    m.unit_price = body.unit_price
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _require_enabled()
    m = db.query(Material).filter(Material.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(m)
    db.commit()
