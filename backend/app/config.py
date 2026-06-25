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

