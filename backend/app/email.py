import html as html_lib
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from sqlalchemy.orm import Session

from . import config
from .models.models import Branding

logger = logging.getLogger(__name__)


def _get_branding(db: Session) -> Branding:
    b = db.query(Branding).filter(Branding.id == 1).first()
    if not b:
        b = Branding(id=1)
        db.add(b)
        db.commit()
        db.refresh(b)
    return b


def _logo_html(branding: Branding) -> str:
    """Matches document_branding.logo_html()'s approach: an <img> when a logo
    is configured, else a wordmark split from company_name at the first space."""
    if branding.logo_url:
        safe_url = html_lib.escape(branding.logo_url)
        safe_name = html_lib.escape(branding.company_name)
        return f'<img src="{safe_url}" alt="{safe_name}" style="max-height:28px">'
    name = branding.company_name or "Your Company"
    parts = name.split(" ", 1)
    first = html_lib.escape(parts[0])
    rest = html_lib.escape(parts[1]) if len(parts) > 1 else ""
    return f'<div class="logo">{first}<span>{rest}</span></div>'


def _send(to: str, subject: str, html: str) -> None:
    if not config.SMTP_HOST or not to:
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = config.SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        if config.SMTP_TLS:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT) as s:
                s.starttls()
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASSWORD)
                s.sendmail(config.SMTP_FROM, [to], msg.as_string())
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT) as s:
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASSWORD)
                s.sendmail(config.SMTP_FROM, [to], msg.as_string())
    except Exception:
        logger.exception("Failed to send email to %s (subject: %s)", to, subject)


def _ticket_style(branding: Branding) -> str:
    return f"""
    body{{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:{branding.text_color};background:#F4F7FC;margin:0;padding:0}}
    .wrap{{max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}}
    .header{{background:{branding.primary_color};padding:20px 28px;color:#fff}}
    .logo{{font-size:20px;font-weight:800;letter-spacing:-0.3px}}
    .logo span{{color:{branding.accent_color}}}
    .body{{padding:24px 28px}}
    .field{{margin-bottom:12px}}
    .label{{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:{branding.muted_color};margin-bottom:3px}}
    .value{{font-size:14px;color:{branding.text_color}}}
    .badge{{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}}
    .footer{{background:#F4F7FC;padding:14px 28px;font-size:11px;color:{branding.muted_color};border-top:1px solid #D8E2F0}}
    """


def _footer_html(branding: Branding) -> str:
    name = html_lib.escape(branding.company_name or "Your Company")
    return f'<div class="footer">{name}</div>'


def notify_ticket_created(db: Session, ticket_id: str, title: str, priority: str, client_email: str, client_name: str, assignee_email: str = "") -> None:
    branding = _get_branding(db)
    priority_color = {"Urgent": "#c0392b", "High": "#d97706", "Medium": branding.primary_color, "Low": branding.muted_color}.get(priority, branding.muted_color)
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style(branding)}</style></head><body>
    <div class="wrap">
      <div class="header">{_logo_html(branding)}</div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">New Ticket Created</p>
        <div class="field"><div class="label">Ticket ID</div><div class="value" style="font-family:monospace">{ticket_id}</div></div>
        <div class="field"><div class="label">Title</div><div class="value">{title}</div></div>
        <div class="field"><div class="label">Priority</div><div class="value"><span class="badge" style="background:{priority_color};color:#fff">{priority}</span></div></div>
        <p style="margin-top:20px;color:{branding.muted_color};font-size:13px">Log in to Dispatch to view and update this ticket.</p>
      </div>
      {_footer_html(branding)}
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] Your support request has been received", html)
    if assignee_email:
        _send(assignee_email, f"[{ticket_id}] Ticket assigned to you: {title}", html)


def notify_ticket_updated(db: Session, ticket_id: str, title: str, status: str, priority: str, client_email: str, assignee_email: str = "", prev_status: str = "") -> None:
    if status == prev_status:
        return
    branding = _get_branding(db)
    status_color = {"Open": branding.primary_color, "In Progress": "#d97706", "Awaiting Client": branding.muted_color, "Resolved": "#1a8f4a", "Closed": branding.muted_color}.get(status, branding.muted_color)
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style(branding)}</style></head><body>
    <div class="wrap">
      <div class="header">{_logo_html(branding)}</div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">Ticket Updated</p>
        <div class="field"><div class="label">Ticket ID</div><div class="value" style="font-family:monospace">{ticket_id}</div></div>
        <div class="field"><div class="label">Title</div><div class="value">{title}</div></div>
        <div class="field"><div class="label">Status</div><div class="value"><span class="badge" style="background:{status_color};color:#fff">{status}</span></div></div>
        <p style="margin-top:20px;color:{branding.muted_color};font-size:13px">Log in to Dispatch to view this ticket.</p>
      </div>
      {_footer_html(branding)}
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] Your ticket status has changed to {status}", html)
    if assignee_email:
        _send(assignee_email, f"[{ticket_id}] Status changed to {status}: {title}", html)


def notify_comment_added(db: Session, ticket_id: str, title: str, comment_body: str, author_name: str, client_email: str) -> None:
    branding = _get_branding(db)
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style(branding)}</style></head><body>
    <div class="wrap">
      <div class="header">{_logo_html(branding)}</div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">New Comment on Your Ticket</p>
        <div class="field"><div class="label">Ticket</div><div class="value" style="font-family:monospace">{ticket_id} — {title}</div></div>
        <div class="field"><div class="label">From</div><div class="value">{author_name}</div></div>
        <div style="background:#F4F7FC;border-left:3px solid {branding.primary_color};padding:12px 16px;border-radius:0 6px 6px 0;margin-top:12px;font-size:14px;white-space:pre-wrap">{comment_body}</div>
        <p style="margin-top:20px;color:{branding.muted_color};font-size:13px">Log in to Dispatch to reply.</p>
      </div>
      {_footer_html(branding)}
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] New comment from {author_name}", html)
