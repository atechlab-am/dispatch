#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest code..."
git pull

echo "==> Stopping containers (volumes preserved)..."
docker compose down

echo "==> Rebuilding images (no cache)..."
docker compose build --no-cache

echo "==> Starting containers..."
docker compose up -d

echo "==> Done. Waiting for health check..."
sleep 5
docker compose ps
