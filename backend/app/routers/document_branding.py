from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import DocumentBranding, User
from ..security import require_admin, get_current_user
from ..document_branding import (
    render_template, TemplateRenderError, INVOICE_PLACEHOLDERS, QUOTE_PLACEHOLDERS,
)

router = APIRouter(prefix="/document-branding", tags=["document-branding"])


class DocumentBrandingIn(BaseModel):
    company_name: str = Field("Your Company", max_length=255)
    website: str = Field("example.com", max_length=255)
    primary_color: str = Field("#2563EB", max_length=20)
    accent_color: str = Field("#F59E0B", max_length=20)
    text_color: str = Field("#0F172A", max_length=20)
    muted_color: str = Field("#64748B", max_length=20)
    on_color_text: str = Field("#FFFFFF", max_length=20)
    logo_url: str = ""
    footer_text: str = Field("Thank you for your business", max_length=500)
    font_size_header: int = Field(22, ge=10, le=48)
    font_size_body: int = Field(14, ge=8, le=24)
    font_size_table: int = Field(13, ge=8, le=24)
    font_size_totals: int = Field(15, ge=8, le=28)
    use_custom_invoice_template: bool = False
    custom_invoice_template: str = ""
    use_custom_quote_template: bool = False
    custom_quote_template: str = ""


class DocumentBrandingOut(DocumentBrandingIn):
    updated_at: datetime
    model_config = {"from_attributes": True}


class TemplateReferenceOut(BaseModel):
    invoice_placeholders: list[str]
    quote_placeholders: list[str]


def _get_or_create(db: Session) -> DocumentBranding:
    b = db.query(DocumentBranding).filter(DocumentBranding.id == 1).first()
    if not b:
        b = DocumentBranding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


def _sample_invoice_context() -> dict:
    """Fixed sample data for validating/previewing a custom template without
    needing a real invoice — same field set as _invoice_template_context()
    in routers/invoices.py, kept in sync manually (no live DB row needed)."""
    return {
        "company_name": "Your Company", "website": "example.com",
        "footer_text": "Thank you for your business",
        "logo_html": '<div class="logo">Your<span>Company</span></div>',
        "primary_color": "#2563EB", "accent_color": "#F59E0B",
        "text_color": "#0F172A", "muted_color": "#64748B", "on_color_text": "#FFFFFF",
        "font_size_header": 22, "font_size_body": 14, "font_size_table": 13, "font_size_totals": 15,
        "invoice_id": "INV-2026-00001", "status": "Sent", "status_color": "#2563EB",
        "paid_stamp_html": "",
        "client_name": "Acme Corp", "client_email_html": "<p>billing@acme.example.com</p>",
        "address_html": "<p style='white-space:pre-line'>123 Main St, Springfield</p>",
        "issue_date": str(date.today()), "due_date_html": "<p><strong>Due Date:</strong> 2026-08-01</p>",
        "tickets_html": "<p><strong>Ticket:</strong> TKT-2026-00042</p>",
        "lines_html": (
            "<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>Server health check</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>1</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>$300.00</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>$300.00</td></tr>"
        ),
        "subtotal": "300.00", "tax_line_html": "", "total": "300.00",
        "paid_line_html": "", "balance_line_html": "", "payments_html": "", "notes_html": "",
    }


def _sample_quote_context() -> dict:
    return {
        "company_name": "Your Company", "website": "example.com",
        "footer_text": "Thank you for your business",
        "logo_html": '<div class="logo">Your<span>Company</span></div>',
        "primary_color": "#2563EB", "accent_color": "#F59E0B",
        "text_color": "#0F172A", "muted_color": "#64748B", "on_color_text": "#FFFFFF",
        "font_size_header": 22, "font_size_body": 14, "font_size_table": 13, "font_size_totals": 15,
        "quote_id": "QUO-2026-00001", "status": "Sent", "status_color": "#2563EB",
        "client_name": "Acme Corp", "client_email_html": "<p>billing@acme.example.com</p>",
        "project_html": "<p><strong>Project:</strong> Office Network Upgrade</p>",
        "issue_date": str(date.today()), "expiry_html": "<p><strong>Expires:</strong> 2026-08-01</p>",
        "lines_html": (
            "<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>Consulting</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>2</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>$100.00</td>"
            "<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>$200.00</td></tr>"
        ),
        "subtotal": "200.00", "tax_line_html": "", "total": "200.00", "notes_html": "",
    }


@router.get("/placeholders", response_model=TemplateReferenceOut)
def get_template_placeholders(_: User = Depends(get_current_user)):
    return TemplateReferenceOut(invoice_placeholders=INVOICE_PLACEHOLDERS, quote_placeholders=QUOTE_PLACEHOLDERS)


@router.get("", response_model=DocumentBrandingOut)
def get_document_branding(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _get_or_create(db)


@router.put("", response_model=DocumentBrandingOut)
def update_document_branding(
    body: DocumentBrandingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Dry-run any enabled custom template against sample data before saving —
    # a broken template must never be persisted, since a saved broken
    # template would otherwise silently fall back to the default layout on
    # every real invoice/quote from then on with no visible error.
    if body.use_custom_invoice_template and body.custom_invoice_template:
        try:
            render_template(body.custom_invoice_template, _sample_invoice_context())
        except TemplateRenderError as e:
            raise HTTPException(status_code=422, detail=f"Invoice template error: {e}")
    if body.use_custom_quote_template and body.custom_quote_template:
        try:
            render_template(body.custom_quote_template, _sample_quote_context())
        except TemplateRenderError as e:
            raise HTTPException(status_code=422, detail=f"Quote template error: {e}")

    b = _get_or_create(db)
    b.company_name = body.company_name
    b.website = body.website
    b.primary_color = body.primary_color
    b.accent_color = body.accent_color
    b.text_color = body.text_color
    b.muted_color = body.muted_color
    b.on_color_text = body.on_color_text
    b.logo_url = body.logo_url
    b.footer_text = body.footer_text
    b.font_size_header = body.font_size_header
    b.font_size_body = body.font_size_body
    b.font_size_table = body.font_size_table
    b.font_size_totals = body.font_size_totals
    b.use_custom_invoice_template = body.use_custom_invoice_template
    b.custom_invoice_template = body.custom_invoice_template
    b.use_custom_quote_template = body.use_custom_quote_template
    b.custom_quote_template = body.custom_quote_template
    b.updated_at = datetime.now(timezone.utc)
    b.updated_by = current_user.id
    db.commit()
    db.refresh(b)
    return b


class PreviewIn(BaseModel):
    template: str


@router.post("/preview/invoice", response_class=HTMLResponse)
def preview_invoice_template(body: PreviewIn, _: User = Depends(get_current_user)):
    try:
        return HTMLResponse(content=render_template(body.template, _sample_invoice_context()))
    except TemplateRenderError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/preview/quote", response_class=HTMLResponse)
def preview_quote_template(body: PreviewIn, _: User = Depends(get_current_user)):
    try:
        return HTMLResponse(content=render_template(body.template, _sample_quote_context()))
    except TemplateRenderError as e:
        raise HTTPException(status_code=422, detail=str(e))
