<#
.SYNOPSIS
    Fresh-machine installer for Dispatch (Windows, PowerShell, native — no WSL required).

.DESCRIPTION
    1. Checks for git and Docker Desktop (with Compose v2) — does not install
       either, just reports what's missing and how to get it.
    2. Clones the repo (or reuses it if this script is already run from inside
       a checkout) into the target directory.
    3. Generates a real .env with a random SECRET_KEY/POSTGRES_PASSWORD — never
       reuses the placeholder values from .env.example or .env.demo.
    4. Runs `docker compose up -d --build`.

    This is for a brand-new install only. If Dispatch is already running and
    you want to update it to the latest code, use scripts\windows\update.ps1
    instead — running this script again against an existing install will NOT
    overwrite an existing .env (it's left untouched if already present).

.PARAMETER InstallDir
    Where to clone/install. Defaults to .\dispatch in the current directory.

.PARAMETER RepoUrl
    Git URL to clone. Defaults to the upstream Dispatch repo.

.PARAMETER GitRef
    Branch/tag to check out after cloning. Defaults to "main".

.EXAMPLE
    .\install.ps1
    .\install.ps1 -InstallDir C:\Apps\dispatch
#>

[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path (Get-Location) "dispatch"),
    [string]$RepoUrl = "https://github.com/atechlab-am/dispatch.git",
    [string]$GitRef = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================="
Write-Host " Dispatch installer"
Write-Host "=================================================================="
Write-Host ""

# ── Step 1: prerequisites ────────────────────────────────────────────────────
Write-Host "==> Step 1/4: Checking prerequisites..."

$missing = $false

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: git is not installed."
    Write-Host "       Install Git for Windows: https://git-scm.com/download/win"
    $missing = $true
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: docker is not installed."
    Write-Host "       Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
    $missing = $true
} else {
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: docker is installed but the 'docker compose' (v2, no hyphen) plugin isn't available."
        Write-Host "       Update Docker Desktop to a recent version — Compose v2 ships with it."
        $missing = $true
    }
}

if ($missing) {
    Write-Host ""
    Write-Host "Install the missing prerequisite(s) above, then re-run this script."
    exit 1
}
Write-Host "    git and docker compose found."

# ── Step 2: get the code ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 2/4: Getting the code..."

$scriptDir = $PSScriptRoot
$repoRootCandidate = Join-Path (Join-Path $scriptDir "..") ".."
$composeFileCandidate = Join-Path $repoRootCandidate "docker-compose.yml"
$gitDirCandidate = Join-Path $repoRootCandidate ".git"

if ((Test-Path $composeFileCandidate) -and (Test-Path $gitDirCandidate)) {
    $repoDir = (Resolve-Path $repoRootCandidate).Path
    Write-Host "    Running from inside an existing checkout: $repoDir"
} else {
    if (Test-Path (Join-Path $InstallDir ".git")) {
        Write-Host "    $InstallDir already exists and looks like a git checkout — reusing it."
        $repoDir = (Resolve-Path $InstallDir).Path
    } else {
        Write-Host "    Cloning $RepoUrl (ref: $GitRef) into $InstallDir..."
        git clone --branch $GitRef $RepoUrl $InstallDir
        if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
        $repoDir = (Resolve-Path $InstallDir).Path
    }
}
Set-Location $repoDir
Write-Host "    Working directory: $repoDir"

# ── Step 3: configure .env ───────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 3/4: Configuring .env..."

$envPath = Join-Path $repoDir ".env"
if (Test-Path $envPath) {
    Write-Host "    .env already exists — leaving it untouched."
} else {
    function New-RandomHex([int]$bytes) {
        # Uses RNGCryptoServiceProvider rather than the newer
        # RandomNumberGenerator.Fill() static method, since the latter needs
        # .NET 6+ / PowerShell 7+ and this script also needs to work on the
        # Windows PowerShell 5.1 that ships by default on many machines.
        $buffer = New-Object byte[] $bytes
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $rng.GetBytes($buffer)
        -join ($buffer | ForEach-Object { $_.ToString("x2") })
    }

    $secretKey = New-RandomHex 32
    $postgresPassword = New-RandomHex 20

    @"
POSTGRES_DB=dispatch
POSTGRES_USER=dispatch
POSTGRES_PASSWORD=$postgresPassword
SECRET_KEY=$secretKey

# Port the client portal service listens on (default: 8080).
# Point your reverse proxy / tunnel to this port if you expose the portal
# separately from the staff app — see README.md for details.
PORTAL_PORT=8080
"@ | Set-Content -Path $envPath -Encoding ascii

    Write-Host "    Generated .env with random SECRET_KEY and POSTGRES_PASSWORD."
    Write-Host "    See .env.example for the full list of optional settings (SMTP, Stripe, backups, feature toggles, etc.) — copy over anything you need."
}

# ── Step 4: start the stack ──────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 4/4: Starting Dispatch (docker compose up -d --build)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host ""
Write-Host "=================================================================="
Write-Host " Done. Waiting for the backend to become healthy..."
for ($i = 0; $i -lt 30; $i++) {
    $status = docker compose ps backend 2>$null
    if ($status -match "healthy") { break }
    Start-Sleep -Seconds 2
}
docker compose ps

Write-Host ""
Write-Host " Open http://localhost — the setup wizard runs on first boot to create"
Write-Host " your admin account."
Write-Host ""
Write-Host " To update Dispatch later, run: scripts\windows\update.ps1"
Write-Host "=================================================================="
