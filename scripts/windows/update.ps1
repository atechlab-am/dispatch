<#
.SYNOPSIS
    Updates an already-installed Dispatch to the latest code (Windows, PowerShell).

.DESCRIPTION
    Assumes Dispatch is already installed and running (see
    scripts\windows\install.ps1 if it isn't). Pulls the latest app code,
    rebuilds images, and restarts containers — does NOT touch the Postgres
    version itself; for a Postgres major-version upgrade see
    upgrade-postgres.sh at the repo root (run via WSL/Git Bash, or adapt
    manually — there is currently no native PowerShell equivalent).

.EXAMPLE
    .\update.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# This script lives in scripts\windows\ — the repo root (where
# docker-compose.yml and .env live) is two directories up.
$repoDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoDir

Write-Host "==> Pulling latest code..."
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

Write-Host "==> Backing up before update (best-effort, requires BACKUP_NAS_HOST in .env)..."
docker compose exec -T backend python3 -c "from app.backup import run_backup; r = run_backup(); print('Backup:', 'OK' if r.success else f'skipped/failed: {r.error}')" 2>$null
# Best-effort: don't fail the update if the backup step errors (e.g. backups not configured)

Write-Host "==> Stopping containers (volumes preserved)..."
docker compose down

Write-Host "==> Rebuilding images (no cache)..."
docker compose build --no-cache
if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

Write-Host "==> Removing old images and build cache (volumes preserved)..."
docker image prune -f
docker builder prune -f

Write-Host "==> Starting containers..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host "==> Done. Waiting for health check..."
Start-Sleep -Seconds 5
docker compose ps
