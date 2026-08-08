# Dispatch

A self-hosted ticketing and client management system for IT/MSP teams. See
[Documentation](#documentation) below for the full docs — also readable inside the running app
from the sidebar's **Docs** link.

## Install (new machine, Docker)

Fresh-machine installer — checks for git/Docker, clones the repo, generates a real `.env` with random secrets, and starts the stack. Requires git and Docker (with the Compose v2 plugin) already installed.

**Don't use Docker?** See [Install (new machine, bare metal — no Docker)](#install-new-machine-bare-metal--no-docker) below instead.

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/atechlab-am/dispatch/main/scripts/linux/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/atechlab-am/dispatch/main/scripts/windows/install.ps1 | iex
```

Either script clones into `./dispatch` by default (override with `INSTALL_DIR=/path ./install.sh` or `-InstallDir` on Windows). If you've already cloned the repo yourself, just run `scripts/linux/install.sh` or `scripts\windows\install.ps1` from inside it instead — it detects the existing checkout and skips cloning.

Re-running install against an existing install is safe: it never overwrites an existing `.env`.

Open **http://localhost** — the setup wizard runs on first boot to create your admin account.

## Run (manual / local dev)

If you'd rather set things up by hand instead of using the installer above:

```bash
cp .env.demo .env
docker compose up -d --build
```

```bash
docker compose down      # stop (database preserved)
docker compose down -v   # stop + wipe database
```

`.env.demo` uses fixed, publicly-known placeholder secrets — fine for local evaluation, **not** for anything reachable outside your machine. Use the installer above (or copy `.env.example` and fill in your own `SECRET_KEY`/`POSTGRES_PASSWORD`) for a real deployment.

## Update (existing install)

**Linux / macOS:**
```bash
./scripts/linux/update.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\windows\update.ps1
```

Pulls latest code, rebuilds images without cache, restarts containers. Database migrations run automatically on startup. (`upgrade.sh` at the repo root does the same thing and still works — the `scripts/` versions are a separate, independent copy kept for discoverability alongside the install scripts.)

`upgrade.sh` tags the current `backend`/`frontend`/`frontend-portal` images as `:previous` before rebuilding (not deleted), so a bad upgrade can be rolled back — the script prints the exact `docker tag ... && docker compose up -d` commands to do so at the end of its output. It checks for the `buildx` CLI plugin up front and installs it automatically if missing (downloading the official release binary into `~/.docker/cli-plugins/`), since `docker compose build` silently falls back to the deprecated legacy builder without it. Build output uses BuildKit's compact progress-bar UI (`BUILDKIT_PROGRESS=tty`) instead of verbose layer-by-layer logs, even when run non-interactively (e.g. over SSH or piped to a log file). It polls compose's `ps` output until every service reports healthy (or no healthcheck is defined) before printing a final summary with the Staff app and Client Portal URLs — both shown via the server's hostname and LAN IP (not `localhost`, since that's only reachable from the server itself). Works with either the `docker compose` v2 plugin or the legacy standalone `docker-compose` binary — it detects which one is actually installed and uses that.

### Upgrading Postgres's major version

Neither `upgrade.sh` nor `scripts/*/update.*` change the Postgres version — they only rebuild images against whatever Postgres tag is already pinned in `docker-compose.yml`. A Postgres major-version bump (e.g. 16 → 18) needs its own procedure, since Postgres doesn't support starting a newer major version directly against an older version's on-disk data:

```bash
./upgrade-postgres.sh 18-alpine
```

This dumps the running database, stops the stack, renames (never deletes) the old data volume as a safety net, starts a fresh container on the target version, restores the dump, then brings the rest of the stack back up — printing an explicit rollback command at the end. Note: Postgres 18 also changed the image's expected volume-mount layout (`/var/lib/postgresql` instead of `/var/lib/postgresql/data`); the script detects and handles this automatically for 18+ targets.

**Run this before an app-code update, not after, and as its own separate step:**
1. Take an independent backup first if you have one configured (Settings → Backup → Backup Now) — this script's own safety net (a renamed local volume) isn't a substitute for an off-host backup.
2. Run `./upgrade-postgres.sh 18-alpine` on its own, from the repo root, with the stack already up (`docker compose ps` should show `postgres` healthy). This only changes the Postgres container/data — it doesn't touch app code and doesn't require a new release.
3. Confirm the app works normally against the new Postgres version (log in, browse a few pages, spot-check data you care about).
4. Once satisfied, remove the old backup volume using the command the script prints at the end.
5. From then on, run `upgrade.sh` / `scripts/*/update.*` as usual for ordinary app-code updates — they keep whatever Postgres version step 2 left in `docker-compose.yml` and never change it themselves.

Doing the Postgres jump and an app-code update in the same sitting makes it harder to tell which change caused a problem if something looks wrong afterward — verify the Postgres jump on its own first.

## Install (new machine, bare metal — no Docker)

For machines that don't run Docker at all. Installs and configures everything as native OS services instead of containers: Postgres (via the OS package manager / official installer), the FastAPI backend (Python venv + gunicorn, run as a service), and nginx serving the built frontend + reverse-proxying `/api` to the backend.

**Linux (Debian/Ubuntu via apt, or Fedora/RHEL/Rocky via dnf):**
```bash
./scripts/linux/install-bare-metal.sh
```
Run as a regular user with sudo access (not as root — the script calls `sudo` itself for the steps that need it). Installs prerequisites via the detected package manager, provisions a local Postgres database, sets up the backend in a Python venv running under a dedicated `dispatch` systemd service, builds the frontend, and configures two nginx server blocks (staff app on port 80, client portal on `PORTAL_PORT`/8080).

**Windows (PowerShell, elevated/"Run as Administrator"):**
```powershell
.\scripts\windows\install-bare-metal.ps1
```
Installs prerequisites via `winget` (Git, Python, Node.js, PostgreSQL), downloads nginx-for-Windows and NSSM directly (neither has a winget package), provisions the database, sets up the backend venv, and wraps both the backend and nginx as Windows Services via NSSM so they survive reboots without a login session. You'll be prompted for the PostgreSQL superuser password you set during the PostgreSQL installer's setup.

Both scripts are install-only (they don't overwrite an existing `.env`, and are safe to re-run against an already-installed system). There's no bare-metal `update` script yet — to update an existing bare-metal install: `git pull`, reinstall backend dependencies, re-run migrations, rebuild the frontend, then restart the backend and nginx services. See the comment at the top of each `install-bare-metal.*` script for the exact commands.

These are fully independent of the Docker-based scripts above — use one or the other, not both, for a given install.

## Stack

React 18 + Vite · FastAPI · PostgreSQL · nginx · Docker

## Documentation

- [docs/getting-started.md](docs/getting-started.md) — first boot, setup wizard, right-after-login checklist
- [docs/features.md](docs/features.md) — full feature-by-feature reference
- [docs/operations.md](docs/operations.md) — health checks, logs, common failure modes

All three are also readable inside the running app from the sidebar's **Docs** link, so they
travel with every install rather than living only on GitHub.
