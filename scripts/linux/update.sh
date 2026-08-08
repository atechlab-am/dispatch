#!/bin/bash
# Updates an already-installed Dispatch to the latest code (Linux/macOS).
#
# This assumes Dispatch is already installed and running (see
# scripts/linux/install.sh if it isn't). It pulls the latest app code,
# rebuilds images, and restarts containers — it does NOT touch the Postgres
# version itself; for a Postgres major-version upgrade see upgrade-postgres.sh
# at the repo root.
#
# Usage:
#   ./scripts/linux/update.sh

set -e

# This script lives in scripts/linux/ — the repo root (where docker-compose.yml
# and .env live) is two directories up.
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest code..."
git pull

echo "==> Backing up before update (best-effort, requires BACKUP_NAS_HOST in .env)..."
docker compose exec -T backend python3 -c "from app.backup import run_backup; r = run_backup(); print('Backup:', 'OK' if r.success else f'skipped/failed: {r.error}')" || true

echo "==> Stopping containers (volumes preserved)..."
docker compose down

echo "==> Rebuilding images (no cache)..."
docker compose build --no-cache

echo "==> Removing old images and build cache (volumes preserved)..."
docker image prune -f
docker builder prune -f

echo "==> Starting containers..."
docker compose up -d

echo "==> Done. Waiting for health check..."
sleep 5
docker compose ps
