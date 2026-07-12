#!/bin/bash
# Upgrades the Postgres major version (e.g. 16 -> 18) via dump/restore.
#
# Postgres does NOT support starting a newer major version directly against
# an older version's on-disk data directory — the file format changes between
# major versions. Swapping the image tag in docker-compose.yml without this
# script would either crash-loop the container or, in some setups, cause it
# to silently initialize a fresh empty database, discarding everything.
#
# This script:
#   1. Takes a fresh pg_dump (custom format) from the CURRENTLY RUNNING Postgres
#   2. Stops the stack and renames the old data volume (never deletes it)
#   3. Starts a new Postgres container on the target version with a fresh volume
#   4. Restores the dump into it
#   5. Runs the app's own migrations (alembic) and a basic health check
#   6. Leaves the OLD volume renamed-but-intact until you explicitly remove it
#
# Usage:
#   ./upgrade-postgres.sh <target-tag>
#   ./upgrade-postgres.sh 18-alpine
#
# Safe to re-run: it always dumps fresh, and refuses to overwrite an old-volume
# backup it already made in a previous run (see step 2).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

TARGET_TAG="${1:-}"
if [ -z "$TARGET_TAG" ]; then
  echo "Usage: $0 <target-postgres-tag>   e.g. $0 18-alpine"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $REPO_DIR. Run this from the repo root with your real .env in place."
  exit 1
fi

# Load POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD from .env without
# executing the whole file (it may contain other shell-unsafe values).
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env | tail -1 | cut -d= -f2-)
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env | tail -1 | cut -d= -f2-)
POSTGRES_DB="${POSTGRES_DB:-dispatch}"
POSTGRES_USER="${POSTGRES_USER:-dispatch}"

CURRENT_IMAGE=$(grep -E '^\s*image:\s*postgres:' docker-compose.yml | head -1 | sed -E 's/.*image:\s*//')
CURRENT_TAG=$(echo "$CURRENT_IMAGE" | cut -d: -f2)
TARGET_IMAGE="postgres:${TARGET_TAG}"

TS=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="pg_upgrade_${CURRENT_TAG}_to_${TARGET_TAG}_${TS}.dump"
OLD_VOLUME_BACKUP_TAG="preupgrade_${CURRENT_TAG}_${TS}"

echo "=================================================================="
echo " Postgres upgrade: ${CURRENT_IMAGE} -> ${TARGET_IMAGE}"
echo " Database: ${POSTGRES_DB}  (user: ${POSTGRES_USER})"
echo "=================================================================="
echo
read -r -p "This will stop the running stack and rename the current data volume. Continue? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo
echo "==> Step 1/6: Confirming the current Postgres container is up..."
if ! docker compose ps postgres | grep -q "Up\|running"; then
  echo "ERROR: postgres service isn't running. Start the stack first (docker compose up -d) before upgrading."
  exit 1
fi

echo
echo "==> Step 2/6: Dumping the current database (custom format, includes schema + data)..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F custom -f "/tmp/${DUMP_FILE}"
docker compose cp "postgres:/tmp/${DUMP_FILE}" "./${DUMP_FILE}"
docker compose exec -T postgres rm -f "/tmp/${DUMP_FILE}"

if [ ! -s "./${DUMP_FILE}" ]; then
  echo "ERROR: dump file is missing or empty. Aborting before touching anything else."
  exit 1
fi
DUMP_SIZE=$(du -h "./${DUMP_FILE}" | cut -f1)
echo "    Dump saved to ${REPO_DIR}/${DUMP_FILE} (${DUMP_SIZE})"

echo
echo "==> Step 3/6: Stopping the stack (this does NOT delete any volumes)..."
docker compose down

echo
echo "==> Step 4/6: Renaming the old data volume so the new Postgres gets a clean slate..."
COMPOSE_PROJECT=$(basename "$REPO_DIR" | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')
OLD_VOLUME="${COMPOSE_PROJECT}_postgres_data"
BACKUP_VOLUME="${COMPOSE_PROJECT}_postgres_data_${OLD_VOLUME_BACKUP_TAG}"

if ! docker volume inspect "$OLD_VOLUME" > /dev/null 2>&1; then
  echo "ERROR: expected volume '$OLD_VOLUME' not found. Check 'docker volume ls' and adjust manually — aborting rather than guessing."
  exit 1
fi

docker volume create "$BACKUP_VOLUME" > /dev/null
docker run --rm \
  -v "${OLD_VOLUME}:/from" \
  -v "${BACKUP_VOLUME}:/to" \
  alpine sh -c "cd /from && cp -a . /to/"
echo "    Old data preserved in Docker volume: ${BACKUP_VOLUME}"
echo "    (Not deleted automatically — remove it yourself once you've confirmed the upgrade, e.g.:"
echo "     docker volume rm ${BACKUP_VOLUME})"

docker volume rm "$OLD_VOLUME" > /dev/null
echo "    Removed the now-empty-to-Postgres-18 volume slot '${OLD_VOLUME}' (data lives on in the backup volume above)"

echo
echo "==> Step 5/6: Starting a fresh ${TARGET_IMAGE} and restoring the dump..."
sed -i.bak -E "s/^([[:space:]]*image:[[:space:]]*postgres:)[A-Za-z0-9._-]+/\1${TARGET_TAG}/" docker-compose.yml

if ! grep -qE "image:[[:space:]]*${TARGET_IMAGE}[[:space:]]*\$" docker-compose.yml; then
  echo "ERROR: docker-compose.yml doesn't show '${TARGET_IMAGE}' after the edit — refusing to continue on a mismatch."
  echo "       Check docker-compose.yml manually (a .bak of the original was left alongside it)."
  exit 1
fi
echo "    Updated docker-compose.yml: postgres image -> ${TARGET_IMAGE} (backup at docker-compose.yml.bak)"

# Postgres 18 changed the official image's expected data layout: it wants a
# single mount at /var/lib/postgresql (data then lives in a version-numbered
# subdirectory), not a mount directly at /var/lib/postgresql/data like every
# version through 17. Mounting the old way makes 18+ refuse to start at all
# ("there appears to be PostgreSQL data in /var/lib/postgresql/data (unused
# mount/volume)"). Detect a target major version >= 18 and fix the mount path.
TARGET_MAJOR=$(echo "$TARGET_TAG" | grep -oE '^[0-9]+' || echo "0")
if [ "$TARGET_MAJOR" -ge 18 ] 2>/dev/null; then
  echo "    Target is Postgres ${TARGET_MAJOR} — updating volume mount path (18+ changed the expected layout)..."
  sed -i.bak2 -E 's#^([[:space:]]*-[[:space:]]*postgres_data:)/var/lib/postgresql/data[[:space:]]*$#\1/var/lib/postgresql#' docker-compose.yml
  if ! grep -qE '^\s*-\s*postgres_data:/var/lib/postgresql\s*$' docker-compose.yml; then
    echo "ERROR: could not update the postgres_data volume mount path for 18+. Check docker-compose.yml manually"
    echo "       (it needs '- postgres_data:/var/lib/postgresql', not '.../data') before continuing."
    exit 1
  fi
  echo "    Updated volume mount: postgres_data:/var/lib/postgresql/data -> postgres_data:/var/lib/postgresql"
fi

docker compose up -d postgres
echo "    Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; then
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres did not become ready in time. Check 'docker compose logs postgres'."
    exit 1
  fi
done

docker compose cp "./${DUMP_FILE}" "postgres:/tmp/${DUMP_FILE}"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/tmp/${DUMP_FILE}"
docker compose exec -T postgres rm -f "/tmp/${DUMP_FILE}"
echo "    Restore complete."

echo
echo "==> Step 6/6: Starting the rest of the stack and running migrations..."
docker compose up -d
sleep 5
echo "    Backend entrypoint runs 'alembic upgrade head' automatically on start — check logs if unsure:"
echo "    docker compose logs backend | tail -30"
echo
docker compose ps

echo
echo "=================================================================="
echo " Done. Verify the app end-to-end (log in, check a few records)"
echo " before removing the backup volume: ${BACKUP_VOLUME}"
echo
echo " If anything looks wrong, roll back with:"
echo "   docker compose down"
echo "   docker volume create ${OLD_VOLUME}"
echo "   docker run --rm -v ${BACKUP_VOLUME}:/from -v ${OLD_VOLUME}:/to alpine sh -c 'cd /from && cp -a . /to/'"
echo "   mv docker-compose.yml.bak docker-compose.yml"
echo "   docker compose up -d"
echo "=================================================================="
