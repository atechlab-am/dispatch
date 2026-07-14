#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Prefer the Compose v2 plugin ("docker compose"); fall back to the legacy
# standalone "docker-compose" binary if that's all this host has, instead of
# hardcoding one form and breaking on whichever the server doesn't have.
if docker compose version > /dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither 'docker compose' (v2 plugin) nor 'docker-compose' (legacy) was found."
  exit 1
fi

# Compact, progress-bar build output instead of verbose layer-by-layer logs —
# BuildKit falls back to plain/verbose mode when it can't detect a TTY (e.g.
# piped through `tee`, run over SSH without a pty, or from cron), which is
# exactly the noisy output this forces back into the normal progress UI.
export BUILDKIT_PROGRESS=tty
export COMPOSE_PROGRESS=tty
export DOCKER_BUILDKIT=1

# ── Ensure buildx is available ───────────────────────────────────────────────
# `docker compose build` silently falls back to the old, deprecated non-
# BuildKit builder when the buildx CLI plugin isn't installed — that's what
# produces the "DEPRECATED: The legacy builder is deprecated..." warning and
# the verbose, unstructured build logs. Install it automatically rather than
# let that happen.
if ! docker buildx version > /dev/null 2>&1; then
  echo "==> buildx plugin not found — installing..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64)  BUILDX_ARCH="amd64" ;;
    aarch64|arm64) BUILDX_ARCH="arm64" ;;
    *) echo "ERROR: unsupported architecture '$ARCH' for automatic buildx install. Install it manually: https://github.com/docker/buildx#installing"; exit 1 ;;
  esac
  BUILDX_VERSION="$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 '"tag_name"' | cut -d '"' -f4)"
  if [ -z "$BUILDX_VERSION" ]; then
    echo "ERROR: could not determine the latest buildx release. Install it manually: https://github.com/docker/buildx#installing"
    exit 1
  fi
  mkdir -p "$HOME/.docker/cli-plugins"
  curl -fsSL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${BUILDX_ARCH}" \
    -o "$HOME/.docker/cli-plugins/docker-buildx"
  chmod +x "$HOME/.docker/cli-plugins/docker-buildx"
  if ! docker buildx version > /dev/null 2>&1; then
    echo "ERROR: buildx install failed. Install it manually: https://github.com/docker/buildx#installing"
    exit 1
  fi
  echo "    Installed buildx ${BUILDX_VERSION}."
fi

# .env isn't sourced into this shell automatically (only docker compose reads
# it directly) — pull PORTAL_PORT out of it here so the printed URL matches
# what's actually configured, falling back to the documented default.
PORTAL_PORT="$(grep -E '^PORTAL_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2)"
PORTAL_PORT="${PORTAL_PORT:-8080}"

# Hostname and LAN IP of this machine, for the final summary — not localhost,
# since that's only reachable from the server itself.
HOST_NAME="$(hostname -f 2>/dev/null || hostname)"
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')"
fi

# Resolved per-service image names (e.g. dispatch-backend or dispatch_backend
# depending on Compose version/naming) — derived instead of hardcoded so this
# script doesn't silently break if that convention differs. `--images` also
# lists transitive dependencies (postgres, pulled not built), so drop any
# name that already carries its own tag — the locally built images here never
# do (Compose reports them bare, tag-less, since :latest is implicit).
mapfile -t IMAGES < <($DC config --images backend frontend frontend-portal | grep -v ':')

echo "==> Pulling latest code..."
git pull

echo "==> Backing up before upgrade (best-effort, requires BACKUP_NAS_HOST in .env)..."
$DC exec -T backend python3 -c "from app.backup import run_backup; r = run_backup(); print('Backup:', 'OK' if r.success else f'skipped/failed: {r.error}')" || true

echo "==> Tagging current images as :previous (recovery point before rebuild)..."
for img in "${IMAGES[@]}"; do
  if docker image inspect "${img}:latest" > /dev/null 2>&1; then
    docker tag "${img}:latest" "${img}:previous"
  fi
done

echo "==> Stopping containers (volumes preserved)..."
$DC down

echo "==> Rebuilding images (no cache)..."
$DC build --no-cache

echo "==> Cleaning up old build cache (previous images kept as :previous for recovery)..."
docker builder prune -f > /dev/null

echo "==> Starting containers..."
$DC up -d

echo "==> Waiting for services to become healthy..."
all_healthy=false
# --format json is a Compose v2-only flag — the legacy standalone
# docker-compose binary doesn't support it, so check once up front and use a
# plain-text fallback (grep for "unhealthy"/"starting" in the table output,
# same approach as scripts/linux/install.sh) instead of failing outright.
if $DC ps --format json > /dev/null 2>&1; then
  PS_JSON_OK=true
else
  PS_JSON_OK=false
fi
for i in $(seq 1 60); do
  if [ "$PS_JSON_OK" = true ]; then
    # Health is "" for services with no healthcheck defined (treat as fine),
    # otherwise "starting" / "healthy" / "unhealthy".
    if $DC ps --format json | python3 -c '
import json, sys

raw = sys.stdin.read()
containers = []
# docker compose ps --format json emits either one JSON object per line
# (NDJSON) or a single JSON array, depending on version — handle both.
try:
    parsed = json.loads(raw)
    containers = parsed if isinstance(parsed, list) else [parsed]
except json.JSONDecodeError:
    for line in raw.splitlines():
        line = line.strip()
        if line:
            containers.append(json.loads(line))

ok = all(c.get("Health", "") in ("", "healthy") for c in containers)
sys.exit(0 if ok else 1)
'; then
      all_healthy=true
      break
    fi
  else
    if ! $DC ps 2>/dev/null | grep -qE "starting|unhealthy"; then
      all_healthy=true
      break
    fi
  fi
  sleep 2
done

echo
echo "=================================================================="
$DC ps
echo "=================================================================="
if [ "$all_healthy" = true ]; then
  echo " All services healthy."
else
  echo " Some services did not report healthy in time — check the output"
  echo " above and '$DC logs' for details."
fi
echo
echo " Staff app:     http://${HOST_NAME}"
if [ -n "$HOST_IP" ]; then echo "                http://${HOST_IP}"; fi
echo " Client Portal: http://${HOST_NAME}:${PORTAL_PORT}"
if [ -n "$HOST_IP" ]; then echo "                http://${HOST_IP}:${PORTAL_PORT}"; fi
echo
echo " To roll back to the pre-upgrade images:"
echo "   $DC down"
for img in "${IMAGES[@]}"; do
  echo "   docker tag ${img}:previous ${img}:latest"
done
echo "   $DC up -d"
echo "=================================================================="
