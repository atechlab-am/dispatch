#!/bin/bash
# Fresh-machine installer for Dispatch (Linux/macOS).
#
# What this does:
#   1. Checks for git and Docker (with Compose v2) — installs neither, just
#      tells you what's missing and how to get it
#   2. Clones the repo (or reuses it if this script is already run from inside
#      a checkout) into the target directory
#   3. Generates a real .env with a random SECRET_KEY/POSTGRES_PASSWORD — never
#      reuses the placeholder values from .env.example or .env.demo
#   4. Runs `docker compose up -d --build`
#
# This is for a brand-new install only. If Dispatch is already running and you
# want to update it to the latest code, use scripts/linux/update.sh instead —
# running this script again against an existing install will NOT overwrite an
# existing .env (it's left untouched if already present).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/atechlab-am/dispatch/main/scripts/linux/install.sh | bash
#   # or, if you already cloned the repo:
#   ./scripts/linux/install.sh
#
# Optional environment variables to override defaults:
#   INSTALL_DIR   Where to clone/install (default: ./dispatch in the current directory)
#   REPO_URL      Git URL to clone (default: the upstream Dispatch repo)
#   GIT_REF       Branch/tag to check out after cloning (default: main)

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/atechlab-am/dispatch.git}"
GIT_REF="${GIT_REF:-main}"

echo "=================================================================="
echo " Dispatch installer"
echo "=================================================================="
echo

# ── Step 1: prerequisites ────────────────────────────────────────────────────
echo "==> Step 1/4: Checking prerequisites..."

MISSING=0
if ! command -v git > /dev/null 2>&1; then
  echo "ERROR: git is not installed."
  echo "       Debian/Ubuntu: sudo apt-get install -y git"
  echo "       macOS:         brew install git  (or install Xcode Command Line Tools)"
  MISSING=1
fi

if ! command -v docker > /dev/null 2>&1; then
  echo "ERROR: docker is not installed."
  echo "       Install Docker Engine or Docker Desktop: https://docs.docker.com/engine/install/"
  MISSING=1
elif ! docker compose version > /dev/null 2>&1; then
  echo "ERROR: docker is installed but the 'docker compose' (v2, no hyphen) plugin isn't available."
  echo "       Install the compose plugin: https://docs.docker.com/compose/install/"
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  echo
  echo "Install the missing prerequisite(s) above, then re-run this script."
  exit 1
fi
echo "    git and docker compose found."

# ── Step 2: get the code ─────────────────────────────────────────────────────
echo
echo "==> Step 2/4: Getting the code..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# If this script is being run from inside an already-cloned repo
# (scripts/linux/install.sh relative to the repo root), reuse that checkout
# instead of cloning a second copy.
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

# ── Step 3: configure .env ───────────────────────────────────────────────────
echo
echo "==> Step 3/4: Configuring .env..."

if [ -f .env ]; then
  echo "    .env already exists — leaving it untouched."
else
  SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  POSTGRES_PASSWORD=$(openssl rand -hex 20 2>/dev/null || head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')

  cat > .env << EOF
POSTGRES_DB=dispatch
POSTGRES_USER=dispatch
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY=${SECRET_KEY}

# Port the client portal service listens on (default: 8080).
# Point your reverse proxy / tunnel to this port if you expose the portal
# separately from the staff app — see README.md for details.
PORTAL_PORT=8080
EOF
  chmod 600 .env
  echo "    Generated .env with random SECRET_KEY and POSTGRES_PASSWORD."
  echo "    See .env.example for the full list of optional settings (SMTP, Stripe, backups, feature toggles, etc.) — copy over anything you need."
fi

# ── Step 4: start the stack ──────────────────────────────────────────────────
echo
echo "==> Step 4/4: Starting Dispatch (docker compose up -d --build)..."
docker compose up -d --build

echo
echo "=================================================================="
echo " Done. Waiting for the backend to become healthy..."
for i in $(seq 1 30); do
  if docker compose ps backend 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 2
done
docker compose ps
echo
echo " Open http://localhost — the setup wizard runs on first boot to create"
echo " your admin account."
echo
echo " To update Dispatch later, run: scripts/linux/update.sh"
echo "=================================================================="
