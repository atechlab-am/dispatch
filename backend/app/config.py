import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]
SECRET_KEY: str = os.environ["SECRET_KEY"]
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
REFRESH_TOKEN_EXPIRE_DAYS: int = 7

# Comma-separated list of allowed CORS origins, e.g. "https://dispatch.atechsolutions.org"
_cors_raw: str = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# SMTP — optional; if SMTP_HOST is unset, email sending is silently skipped
SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER: str = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM: str = os.environ.get("SMTP_FROM", "dispatch@atechsolutions.org")
SMTP_TLS: bool = os.environ.get("SMTP_TLS", "true").lower() == "true"

# File uploads — mounted volume in production
UPLOAD_DIR: str = os.environ.get("UPLOAD_DIR", "/app/uploads")

# GitHub update notifications — optional
# Set GITHUB_REPO to "owner/repo" and GITHUB_TOKEN to a PAT with repo read scope
GITHUB_REPO: str = os.environ.get("GITHUB_REPO", "")
GITHUB_TOKEN: str = os.environ.get("GITHUB_TOKEN", "")

# Stripe — optional; leave all three blank to disable online payments entirely.
# Keys come from the Stripe dashboard: Developers > API keys / Developers > Webhooks.
STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY: str = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Public base URL of the client portal (no trailing slash) — used to build the
# Stripe Checkout success/cancel redirect URLs. Only needed if Stripe is configured.
PORTAL_URL: str = os.environ.get("PORTAL_URL", "http://localhost").rstrip("/")

# Inbound email (email-to-ticket) — optional; if unset, the inbound webhook
# always rejects with 404. Set to a long random value and put it in the
# webhook URL configured in your inbound email provider (e.g. Postmark).
INBOUND_EMAIL_SECRET: str = os.environ.get("INBOUND_EMAIL_SECRET", "")

# Feature toggles — all optional, default enabled ("true"). Set to "false" to
# disable. Disabled endpoints return 503; disabled background loops don't
# start; write_audit()/create_notification() silently no-op regardless of
# which feature calls them when their own toggle is off.
FEATURE_AUDIT_LOG: bool = os.environ.get("FEATURE_AUDIT_LOG", "true").lower() == "true"
FEATURE_TIMER: bool = os.environ.get("FEATURE_TIMER", "true").lower() == "true"
FEATURE_AR_AGING: bool = os.environ.get("FEATURE_AR_AGING", "true").lower() == "true"
FEATURE_NOTIFICATIONS: bool = os.environ.get("FEATURE_NOTIFICATIONS", "true").lower() == "true"
FEATURE_RECURRING_INVOICING: bool = os.environ.get("FEATURE_RECURRING_INVOICING", "true").lower() == "true"
FEATURE_SCHEDULING: bool = os.environ.get("FEATURE_SCHEDULING", "true").lower() == "true"
FEATURE_QUOTES: bool = os.environ.get("FEATURE_QUOTES", "true").lower() == "true"
FEATURE_GLOBAL_SEARCH: bool = os.environ.get("FEATURE_GLOBAL_SEARCH", "true").lower() == "true"
FEATURE_CANNED_RESPONSES: bool = os.environ.get("FEATURE_CANNED_RESPONSES", "true").lower() == "true"
FEATURE_SLA_ESCALATION: bool = os.environ.get("FEATURE_SLA_ESCALATION", "true").lower() == "true"
FEATURE_SLA_TIERS: bool = os.environ.get("FEATURE_SLA_TIERS", "true").lower() == "true"
FEATURE_MATERIALS: bool = os.environ.get("FEATURE_MATERIALS", "true").lower() == "true"

# Two-factor auth (TOTP) — unlike every toggle above, this one defaults to
# DISABLED ("false"). It changes the login flow itself (adds a second step),
# so it must be an explicit opt-in rather than something that silently changes
# behavior for every existing deployment on upgrade.
FEATURE_2FA: bool = os.environ.get("FEATURE_2FA", "false").lower() == "true"

