import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from . import config

logger = logging.getLogger(__name__)


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


def _ticket_style() -> str:
    return """
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#0D1B2A;background:#F4F7FC;margin:0;padding:0}
    .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
    .header{background:#1A5CBA;padding:20px 28px;color:#fff}
    .logo{font-size:20px;font-weight:800;letter-spacing:-0.3px}
    .logo span{color:#E8A020}
    .body{padding:24px 28px}
    .field{margin-bottom:12px}
    .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5B6D82;margin-bottom:3px}
    .value{font-size:14px;color:#0D1B2A}
    .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}
    .footer{background:#F4F7FC;padding:14px 28px;font-size:11px;color:#5B6D82;border-top:1px solid #D8E2F0}
    """


def notify_ticket_created(ticket_id: str, title: str, priority: str, client_email: str, client_name: str, assignee_email: str = "") -> None:
    priority_color = {"Urgent": "#c0392b", "High": "#d97706", "Medium": "#1A5CBA", "Low": "#5B6D82"}.get(priority, "#5B6D82")
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style()}</style></head><body>
    <div class="wrap">
      <div class="header"><div class="logo">ATech<span>Solutions</span></div></div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">New Ticket Created</p>
        <div class="field"><div class="label">Ticket ID</div><div class="value" style="font-family:monospace">{ticket_id}</div></div>
        <div class="field"><div class="label">Title</div><div class="value">{title}</div></div>
        <div class="field"><div class="label">Priority</div><div class="value"><span class="badge" style="background:{priority_color};color:#fff">{priority}</span></div></div>
        <p style="margin-top:20px;color:#5B6D82;font-size:13px">Log in to Dispatch to view and update this ticket.</p>
      </div>
      <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] Your support request has been received", html)
    if assignee_email:
        _send(assignee_email, f"[{ticket_id}] Ticket assigned to you: {title}", html)


def notify_ticket_updated(ticket_id: str, title: str, status: str, priority: str, client_email: str, assignee_email: str = "", prev_status: str = "") -> None:
    if status == prev_status:
        return
    status_color = {"Open": "#1A5CBA", "In Progress": "#d97706", "Awaiting Client": "#5B6D82", "Resolved": "#1a8f4a", "Closed": "#5B6D82"}.get(status, "#5B6D82")
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style()}</style></head><body>
    <div class="wrap">
      <div class="header"><div class="logo">ATech<span>Solutions</span></div></div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">Ticket Updated</p>
        <div class="field"><div class="label">Ticket ID</div><div class="value" style="font-family:monospace">{ticket_id}</div></div>
        <div class="field"><div class="label">Title</div><div class="value">{title}</div></div>
        <div class="field"><div class="label">Status</div><div class="value"><span class="badge" style="background:{status_color};color:#fff">{status}</span></div></div>
        <p style="margin-top:20px;color:#5B6D82;font-size:13px">Log in to Dispatch to view this ticket.</p>
      </div>
      <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] Your ticket status has changed to {status}", html)
    if assignee_email:
        _send(assignee_email, f"[{ticket_id}] Status changed to {status}: {title}", html)


def notify_comment_added(ticket_id: str, title: str, comment_body: str, author_name: str, client_email: str) -> None:
    html = f"""<!DOCTYPE html><html><head><style>{_ticket_style()}</style></head><body>
    <div class="wrap">
      <div class="header"><div class="logo">ATech<span>Solutions</span></div></div>
      <div class="body">
        <p style="font-size:16px;font-weight:700;margin:0 0 16px">New Comment on Your Ticket</p>
        <div class="field"><div class="label">Ticket</div><div class="value" style="font-family:monospace">{ticket_id} — {title}</div></div>
        <div class="field"><div class="label">From</div><div class="value">{author_name}</div></div>
        <div style="background:#F4F7FC;border-left:3px solid #1A5CBA;padding:12px 16px;border-radius:0 6px 6px 0;margin-top:12px;font-size:14px;white-space:pre-wrap">{comment_body}</div>
        <p style="margin-top:20px;color:#5B6D82;font-size:13px">Log in to Dispatch to reply.</p>
      </div>
      <div class="footer">ATechSolutions &nbsp;|&nbsp; atechsolutions.org</div>
    </div></body></html>"""

    if client_email:
        _send(client_email, f"[{ticket_id}] New comment from {author_name}", html)
