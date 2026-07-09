#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest code..."
git pull

echo "==> Backing up before upgrade (best-effort, requires BACKUP_NAS_HOST in .env)..."
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
