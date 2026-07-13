"""Shared helpers for applying DocumentBranding to quote/invoice PDFs and
emails — used by both routers/invoices.py and routers/quotes.py so the
fetch-or-create and logo-markup logic isn't duplicated across the two."""
import html as html_lib

from sqlalchemy.orm import Session

from .models.models import DocumentBranding


def get_document_branding(db: Session) -> DocumentBranding:
    b = db.query(DocumentBranding).filter(DocumentBranding.id == 1).first()
    if not b:
        b = DocumentBranding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


def logo_html(branding: DocumentBranding) -> str:
    """An <img> when a logo is configured, else a wordmark styled from
    company_name split at the first space (matches the pre-branding
    hardcoded "ATech<span>Solutions</span>" look when no logo is set)."""
    if branding.logo_url:
        safe_url = html_lib.escape(branding.logo_url)
        safe_name = html_lib.escape(branding.company_name)
        return f'<img src="{safe_url}" alt="{safe_name}" style="max-height:36px;max-width:220px">'
    name = branding.company_name or "ATech Solutions"
    parts = name.split(" ", 1)
    first = html_lib.escape(parts[0])
    rest = html_lib.escape(parts[1]) if len(parts) > 1 else ""
    return f'<div class="logo">{first}<span>{rest}</span></div>'
