"""Shared helpers for applying DocumentBranding to quote/invoice PDFs and
emails — used by both routers/invoices.py and routers/quotes.py so the
fetch-or-create, logo-markup, and template-rendering logic isn't duplicated
across the two.

Two layers of customization, in order of precedence:
  1. Custom template (raw HTML with {{placeholder}} substitution) — when
     use_custom_invoice_template / use_custom_quote_template is on, this
     completely replaces the built-in layout.
  2. Structured options (font sizes) — applied to the built-in layout when
     no custom template is active.
"""
import html as html_lib
import re

from sqlalchemy.orm import Session

from .models.models import DocumentBranding

# ─── Fetch / logo (unchanged from before) ──────────────────────────────────

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


# ─── Safe {{placeholder}} substitution ─────────────────────────────────────
# Deliberately not str.format() — user-authored HTML/CSS is full of stray
# `{`/`}` (e.g. every CSS rule), which .format() would choke on. This only
# ever touches text that matches `{{identifier}}` and leaves everything else
# (including plain `{`/`}` in CSS) completely alone.

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


class TemplateRenderError(Exception):
    """Raised when a custom template references an unknown placeholder."""


def render_template(template: str, context: dict) -> str:
    unknown = []

    def _sub(m):
        key = m.group(1)
        if key not in context:
            unknown.append(key)
            return m.group(0)
        return str(context[key])

    result = _PLACEHOLDER_RE.sub(_sub, template)
    if unknown:
        raise TemplateRenderError(f"Unknown placeholder(s): {', '.join(sorted(set(unknown)))}")
    return result


# Documented for the frontend's "available placeholders" reference panel —
# shared between invoice and quote templates; a template using a
# quote-only or invoice-only placeholder still works since render_template
# only complains about placeholders that aren't in the *provided* context,
# and each call site provides its own context dict.
INVOICE_PLACEHOLDERS = [
    "company_name", "website", "footer_text", "logo_html",
    "primary_color", "accent_color",
    "invoice_id", "status", "status_color", "paid_stamp_html",
    "client_name", "client_email_html", "address_html",
    "issue_date", "due_date_html", "tickets_html",
    "lines_html", "subtotal", "tax_line_html", "total",
    "paid_line_html", "balance_line_html", "payments_html", "notes_html",
    "font_size_header", "font_size_body", "font_size_table", "font_size_totals",
]

QUOTE_PLACEHOLDERS = [
    "company_name", "website", "footer_text", "logo_html",
    "primary_color", "accent_color",
    "quote_id", "status", "status_color",
    "client_name", "client_email_html", "project_html",
    "issue_date", "expiry_html",
    "lines_html", "subtotal", "tax_line_html", "total", "notes_html",
    "font_size_header", "font_size_body", "font_size_table", "font_size_totals",
]
