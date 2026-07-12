#!/bin/bash
# Fresh-machine BARE-METAL installer for Dispatch (Linux, no Docker).
#
# For a Docker-based install instead, use scripts/linux/install.sh — this
# script is for machines that don't run Docker at all. It installs and
# configures everything as native OS services:
#   - Postgres (via the OS package manager)
#   - The FastAPI backend, in a Python venv, run by gunicorn as a systemd
#     service ("dispatch-backend")
#   - nginx, serving the built frontend and reverse-proxying /api to the
#     backend — two server blocks (staff app on port 80, client portal on
#     PORTAL_PORT/8080), adapted from this repo's nginx.conf/nginx.portal.conf
#
# Supports Debian/Ubuntu (apt) and Fedora/RHEL/Rocky (dnf). Detects which is
# present and uses the right package names/paths for each; aborts with a
# clear message if neither package manager is found.
#
# This is an INSTALL script only — it does not update an existing install.
# To update later: git pull, re-run
#   backend/venv/bin/pip install -r backend/requirements.txt
#   (cd backend && ../backend/venv/bin/python3 -m alembic upgrade head)
#   npm ci && npm run build
# then: sudo systemctl restart dispatch-backend && sudo systemctl reload nginx
#
# Usage (run as a regular user with sudo access — do not run as root directly,
# the script calls sudo itself for the specific steps that need it):
#   ./scripts/linux/install-bare-metal.sh
#
# Optional environment variables:
#   INSTALL_DIR   Where to clone/install (default: ./dispatch in the current directory)
#   REPO_URL      Git URL to clone (default: the upstream Dispatch repo)
#   GIT_REF       Branch/tag to check out after cloning (default: main)
#   PORTAL_PORT   Port nginx serves the client portal on (default: 8080)

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/atechlab-am/dispatch.git}"
GIT_REF="${GIT_REF:-main}"
PORTAL_PORT="${PORTAL_PORT:-8080}"

echo "=================================================================="
echo " Dispatch bare-metal installer (Linux)"
echo "=================================================================="
echo

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: don't run this script directly as root. Run it as a regular user"
  echo "       with sudo access — it calls sudo itself for the specific steps"
  echo "       that need elevated privileges (package install, systemd, nginx)."
  exit 1
fi

if ! command -v sudo > /dev/null 2>&1; then
  echo "ERROR: sudo is required and not found."
  exit 1
fi

# ── Step 1/9: detect package manager ─────────────────────────────────────────
echo "==> Step 1/9: Detecting package manager..."
if command -v apt-get > /dev/null 2>&1; then
  PKG_FAMILY="apt"
  echo "    Detected apt (Debian/Ubuntu)."
elif command -v dnf > /dev/null 2>&1; then
  PKG_FAMILY="dnf"
  echo "    Detected dnf (Fedora/RHEL/Rocky)."
else
  echo "ERROR: neither apt-get nor dnf found. This script supports Debian/Ubuntu"
  echo "       and Fedora/RHEL/Rocky only — install prerequisites manually on"
  echo "       other distributions (see README.md for the list)."
  exit 1
fi

# ── Step 2/9: install prerequisites ──────────────────────────────────────────
echo
echo "==> Step 2/9: Installing prerequisites (git, python3, node, postgresql, nginx)..."

if [ "$PKG_FAMILY" = "apt" ]; then
  sudo apt-get update -y
  sudo apt-get install -y git python3 python3-venv python3-pip postgresql postgresql-contrib nginx curl ca-certificates

  # Debian/Ubuntu's default nodejs package is frequently too old for Vite 6+.
  # Check the version and fall back to NodeSource's setup script if needed.
  NODE_OK=0
  if command -v node > /dev/null 2>&1; then
    NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
    if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then NODE_OK=1; fi
  fi
  if [ "$NODE_OK" -eq 0 ]; then
    echo "    System Node.js is missing or too old (need >= 20) — installing via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  sudo dnf install -y git python3 python3-pip postgresql-server postgresql-contrib nginx curl
  # python3-venv is part of the base python3 package on Fedora; no separate package needed.

  NODE_OK=0
  if command -v node > /dev/null 2>&1; then
    NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
    if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then NODE_OK=1; fi
  fi
  if [ "$NODE_OK" -eq 0 ]; then
    echo "    System Node.js is missing or too old (need >= 20) — installing via NodeSource..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
    sudo dnf install -y nodejs
  fi

  # Fedora/RHEL's postgresql-server needs an explicit first-time initdb, unlike
  # Debian's postgresql package which initializes automatically on install.
  if [ ! -d /var/lib/pgsql/data ] || [ -z "$(ls -A /var/lib/pgsql/data 2>/dev/null)" ]; then
    echo "    Initializing Postgres data directory (first run on this system)..."
    sudo postgresql-setup --initdb
  fi
fi

echo "    Prerequisites installed. Versions:"
echo "      git:    $(git --version)"
echo "      python: $(python3 --version)"
echo "      node:   $(node --version)"
echo "      psql:   $(psql --version 2>/dev/null || echo 'not on PATH yet')"

# ── Step 3/9: get the code ────────────────────────────────────────────────────
echo
echo "==> Step 3/9: Getting the code..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/../../docker-compose.yml" ] && [ -d "${SCRIPT_DIR}/../../.git" ]; then
  REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  echo "    Running from inside an existing checkout: ${REPO_DIR}"
else
  INSTALL_DIR="${INSTALL_DIR:-$(pwd)/dispatch}"
  if [ -d "$INSTALL_DIR/.git" ]; then
    echo "    ${INSTALL_DIR} already exists and looks like a git checkout — reusing it."
    REPO_DIR="$INSTALL_DIR"
  else
    echo "    Cloning ${REPO_URL} (ref: ${GIT_REF}) into ${INSTALL_DIR}..."
    git clone --branch "$GIT_REF" "$REPO_URL" "$INSTALL_DIR"
    REPO_DIR="$INSTALL_DIR"
  fi
fi
cd "$REPO_DIR"
echo "    Working directory: ${REPO_DIR}"

UPLOAD_DIR="${REPO_DIR}/uploads"

# ── Step 4/9: start Postgres and provision the database ─────────────────────
echo
echo "==> Step 4/9: Starting Postgres and provisioning the database..."

if [ "$PKG_FAMILY" = "apt" ]; then
  sudo systemctl enable --now postgresql
else
  sudo systemctl enable --now postgresql
fi

# Wait for Postgres to accept connections before running psql against it.
for i in $(seq 1 15); do
  if sudo -u postgres psql -c '\q' > /dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 15 ]; then
    echo "ERROR: Postgres did not become ready in time."
    exit 1
  fi
done

DB_NAME="dispatch"
DB_USER="dispatch"

ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'")
if [ "$ROLE_EXISTS" = "1" ]; then
  echo "    Postgres role '${DB_USER}' already exists — leaving it and the database untouched."
  DB_ALREADY_PROVISIONED=1
else
  DB_PASSWORD=$(openssl rand -hex 20 2>/dev/null || head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  echo "    Created Postgres role and database '${DB_NAME}'."
  DB_ALREADY_PROVISIONED=0
fi

# ── Step 5/9: configure .env ──────────────────────────────────────────────────
echo
echo "==> Step 5/9: Configuring .env..."

if [ -f .env ]; then
  if ! grep -q '^DATABASE_URL=' .env; then
    echo "ERROR: .env already exists here, but has no DATABASE_URL — it looks like a"
    echo "       Docker-flavored .env (POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD,"
    echo "       consumed by docker-compose.yml) rather than the DATABASE_URL this"
    echo "       bare-metal install needs directly. Rename or remove the existing .env"
    echo "       (back it up first if it's from a real Docker install!) and re-run,"
    echo "       or add a correct DATABASE_URL line to it manually — see .env.example."
    exit 1
  fi
  echo "    .env already exists — leaving it untouched."
else
  if [ "$DB_ALREADY_PROVISIONED" -eq 1 ]; then
    echo "ERROR: Postgres role '${DB_USER}' already existed, but no .env was found here,"
    echo "       so this script doesn't know its password. Either delete the existing"
    echo "       Postgres role and re-run this script, or create .env manually with the"
    echo "       correct DATABASE_URL (see .env.example)."
    exit 1
  fi
  SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')

  cat > .env << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
SECRET_KEY=${SECRET_KEY}
UPLOAD_DIR=${UPLOAD_DIR}
PORTAL_PORT=${PORTAL_PORT}
EOF
  chmod 600 .env
  echo "    Generated .env with a random SECRET_KEY and Postgres password."
  echo "    See .env.example for the full list of optional settings (SMTP, Stripe, backups, feature toggles, etc.) — copy over anything you need, then restart dispatch-backend."
fi

# ── Step 6/9: backend (venv, deps, migrations) ───────────────────────────────
echo
echo "==> Step 6/9: Setting up the backend (Python venv, dependencies, migrations)..."

if [ ! -d backend/venv ]; then
  python3 -m venv backend/venv
fi
backend/venv/bin/pip install --upgrade pip > /dev/null
backend/venv/bin/pip install -r backend/requirements.txt

mkdir -p "${UPLOAD_DIR}/documents"

(cd backend && ../backend/venv/bin/python3 -m alembic upgrade head)
echo "    Migrations applied."

# ── Step 7/9: systemd service for the backend ────────────────────────────────
echo
echo "==> Step 7/9: Installing the dispatch-backend systemd service..."

if ! id -u dispatch > /dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin dispatch
fi
# The service runs as its own "dispatch" user, but does NOT take ownership of
# backend/ — it only needs read+execute access to run gunicorn and read the
# app code/venv, which group-read access covers, plus write access to
# UPLOAD_DIR. Earlier draft used `chown -R dispatch:dispatch backend/`, which
# caused two real problems caught during testing: (1) it left backend/
# un-writable/readable by the invoking user on a second run (pip
# install/alembic in Step 6 would then fail with a permission error), and
# (2) a broader chown of the whole repo also broke `npm ci` for the next
# step. Group-read + a dedicated writable upload dir avoids both.
sudo usermod -aG "$(id -gn "$(whoami)")" dispatch 2>/dev/null || true
sudo chown -R "$(whoami):$(whoami)" "${REPO_DIR}/backend"
sudo chmod -R g+rX "${REPO_DIR}/backend"
sudo chown -R dispatch:dispatch "${UPLOAD_DIR}"
# .env lives at the repo root — grant the dispatch group read access to it
# specifically, without touching anything else in the repo.
sudo chgrp dispatch "${REPO_DIR}/.env"
sudo chmod 640 "${REPO_DIR}/.env"

sudo tee /etc/systemd/system/dispatch-backend.service > /dev/null << EOF
[Unit]
Description=Dispatch backend (gunicorn/uvicorn)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=dispatch
Group=dispatch
WorkingDirectory=${REPO_DIR}/backend
EnvironmentFile=${REPO_DIR}/.env
ExecStart=${REPO_DIR}/backend/venv/bin/gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:8000 --access-logfile - --error-logfile -
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now dispatch-backend
echo "    dispatch-backend service installed and started."

# ── Step 8/9: build the frontend ─────────────────────────────────────────────
echo
echo "==> Step 8/9: Building the frontend (npm ci && npm run build)..."
npm ci
npm run build
echo "    Built to ${REPO_DIR}/dist"

# ── Step 9/9: nginx ───────────────────────────────────────────────────────────
echo
echo "==> Step 9/9: Configuring nginx..."

STAFF_CONF_CONTENT=$(cat << EOF
server {
    listen 80;
    server_name _;
    root ${REPO_DIR}/dist;
    index index.html;

    client_max_body_size 25m;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location /api/ {
        proxy_pass         http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
)

PORTAL_CONF_CONTENT=$(cat << EOF
server {
    listen ${PORTAL_PORT};
    server_name _;
    root ${REPO_DIR}/dist;
    index portal.html;

    client_max_body_size 1m;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location /api/portal/ {
        proxy_pass         http://127.0.0.1:8000/api/portal/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/portal-branding/public {
        proxy_pass         http://127.0.0.1:8000/api/portal-branding/public;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/payments/webhook {
        proxy_pass         http://127.0.0.1:8000/api/payments/webhook;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/inbound-email/ {
        proxy_pass         http://127.0.0.1:8000/api/inbound-email/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/ {
        return 404;
    }

    location /p/ {
        try_files \$uri \$uri/ /portal.html;
    }

    location / {
        try_files \$uri /portal.html;
    }
}
EOF
)

if [ -d /etc/nginx/sites-available ]; then
  # Debian/Ubuntu layout
  echo "$STAFF_CONF_CONTENT" | sudo tee /etc/nginx/sites-available/dispatch > /dev/null
  echo "$PORTAL_CONF_CONTENT" | sudo tee /etc/nginx/sites-available/dispatch-portal > /dev/null
  sudo ln -sf /etc/nginx/sites-available/dispatch /etc/nginx/sites-enabled/dispatch
  sudo ln -sf /etc/nginx/sites-available/dispatch-portal /etc/nginx/sites-enabled/dispatch-portal
  # Debian's nginx package ships a "default" site that also listens on :80 and
  # will conflict with ours — disable it if present.
  sudo rm -f /etc/nginx/sites-enabled/default
else
  # Fedora/RHEL layout — no sites-available/sites-enabled convention
  echo "$STAFF_CONF_CONTENT" | sudo tee /etc/nginx/conf.d/dispatch.conf > /dev/null
  echo "$PORTAL_CONF_CONTENT" | sudo tee /etc/nginx/conf.d/dispatch-portal.conf > /dev/null
fi

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
echo "    nginx configured and reloaded."

echo
echo "=================================================================="
echo " Done."
echo
sudo systemctl status dispatch-backend --no-pager -l | head -5
echo
echo " Open http://localhost — the setup wizard runs on first boot to create"
echo " your admin account. The client portal is at http://localhost:${PORTAL_PORT}"
echo
echo " Backend logs: sudo journalctl -u dispatch-backend -f"
echo " Restart backend: sudo systemctl restart dispatch-backend"
echo "=================================================================="
