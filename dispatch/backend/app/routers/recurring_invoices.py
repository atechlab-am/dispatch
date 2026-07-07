from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models.models import RecurringInvoice, RecurringInvoiceLine, User
from ..schemas import RecurringInvoiceIn, RecurringInvoiceOut
from ..security import require_admin

router = APIRouter(prefix="/recurring-invoices", tags=["recurring-invoices"])

# All five endpoints are admin-only — stricter than recurring tickets (any
# authenticated staff can schedule those) — because a recurring invoice
# schedule touches client billing and can auto-email clients unattended.


def _apply_lines(recurring_invoice: RecurringInvoice, lines: list, db: Session):
    for l in lines:
        db.add(RecurringInvoiceLine(
            recurring_invoice_id=recurring_invoice.id,
            description=l.description,
            qty=l.qty,
            unit_price=l.unit_price,
        ))


@router.get("", response_model=list[RecurringInvoiceOut])
def list_recurring_invoices(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_RECURRING_INVOICING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    return db.query(RecurringInvoice).order_by(RecurringInvoice.name).all()


@router.post("", response_model=RecurringInvoiceOut, status_code=status.HTTP_201_CREATED)
def create_recurring_invoice(
    body: RecurringInvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not config.FEATURE_RECURRING_INVOICING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    from ..tasks import next_run_after
    r = RecurringInvoice(
        name=body.name,
        active=body.active,
        interval=body.interval,
        client_id=body.client_id,
        client_name=body.client_name,
        client_email=body.client_email,
        client_address=body.client_address,
        tax_rate=body.tax_rate,
        notes=body.notes,
        auto_send=body.auto_send,
        created_by=current_user.id,
        next_run=next_run_after(body.interval, datetime.now(timezone.utc)),
    )
    db.add(r)
    db.flush()
    _apply_lines(r, body.lines, db)
    db.commit()
    db.refresh(r)
    return r


@router.get("/{recurring_invoice_id}", response_model=RecurringInvoiceOut)
def get_recurring_invoice(
    recurring_invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_RECURRING_INVOICING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == recurring_invoice_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.put("/{recurring_invoice_id}", response_model=RecurringInvoiceOut)
def update_recurring_invoice(
    recurring_invoice_id: int,
    body: RecurringInvoiceIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_RECURRING_INVOICING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    from ..tasks import next_run_after
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == recurring_invoice_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")

    r.name = body.name
    r.active = body.active
    r.interval = body.interval
    r.client_id = body.client_id
    r.client_name = body.client_name
    r.client_email = body.client_email
    r.client_address = body.client_address
    r.tax_rate = body.tax_rate
    r.notes = body.notes
    r.auto_send = body.auto_send
    r.next_run = next_run_after(body.interval, datetime.now(timezone.utc))

    db.query(RecurringInvoiceLine).filter(RecurringInvoiceLine.recurring_invoice_id == recurring_invoice_id).delete()
    db.flush()
    _apply_lines(r, body.lines, db)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{recurring_invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_invoice(
    recurring_invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not config.FEATURE_RECURRING_INVOICING:
        raise HTTPException(status_code=503, detail="This feature is disabled")
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == recurring_invoice_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
