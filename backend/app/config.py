import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]
SECRET_KEY: str = os.environ["SECRET_KEY"]
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
REFRESH_TOKEN_EXPIRE_DAYS: int = 7

FIRST_ADMIN_EMAIL: str = os.environ.get("FIRST_ADMIN_EMAIL", "admin@atechsolutions.org")
FIRST_ADMIN_PASSWORD: str = os.environ.get("FIRST_ADMIN_PASSWORD", "")
FIRST_ADMIN_NAME: str = os.environ.get("FIRST_ADMIN_NAME", "Admin")
