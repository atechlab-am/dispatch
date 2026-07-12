<#
.SYNOPSIS
    Fresh-machine BARE-METAL installer for Dispatch (Windows, no Docker).

.DESCRIPTION
    For a Docker-based install instead, use scripts\windows\install.ps1 — this
    script is for machines that don't run Docker at all. It installs and
    configures everything as native Windows services:
      - PostgreSQL (official EDB installer via winget)
      - The FastAPI backend, in a Python venv, run by gunicorn, wrapped as a
        Windows Service via NSSM ("DispatchBackend")
      - nginx for Windows, serving the built frontend and reverse-proxying
        /api to the backend — two server blocks (staff app on port 80, client
        portal on PORTAL_PORT/8080), adapted from this repo's
        nginx.conf/nginx.portal.conf — also wrapped as a Windows Service via
        NSSM so it survives reboots without a login session

    Must be run from an elevated (Run as Administrator) PowerShell prompt —
    installing services and writing to Program Files requires it.

    This is an INSTALL script only — it does not update an existing install.
    To update later: git pull, re-run
      backend\venv\Scripts\pip install -r backend\requirements.txt
      (cd backend; ..\backend\venv\Scripts\python.exe -m alembic upgrade head)
      npm ci; npm run build
    then: nssm restart DispatchBackend; nssm restart nginx

.PARAMETER InstallDir
    Where to clone/install. Defaults to .\dispatch in the current directory.

.PARAMETER RepoUrl
    Git URL to clone. Defaults to the upstream Dispatch repo.

.PARAMETER GitRef
    Branch/tag to check out after cloning. Defaults to "main".

.PARAMETER PortalPort
    Port nginx serves the client portal on. Defaults to 8080.

.EXAMPLE
    .\install-bare-metal.ps1
#>

[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path (Get-Location) "dispatch"),
    [string]$RepoUrl = "https://github.com/atechlab-am/dispatch.git",
    [string]$GitRef = "main",
    [int]$PortalPort = 8080
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================="
Write-Host " Dispatch bare-metal installer (Windows)"
Write-Host "=================================================================="
Write-Host ""

# ── Step 0: require elevation ────────────────────────────────────────────────
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: this script must be run from an elevated PowerShell prompt."
    Write-Host "       Right-click PowerShell -> 'Run as Administrator', then re-run this script."
    exit 1
}

# ── Step 1/9: prerequisites via winget ───────────────────────────────────────
Write-Host "==> Step 1/9: Installing prerequisites (git, Python, Node, PostgreSQL)..."

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: winget is not available. It ships with Windows 10 (1809+)/11 by default"
    Write-Host "       via 'App Installer' — install it from the Microsoft Store, then re-run."
    exit 1
}

function Install-WithWinget([string]$id, [string]$friendlyName) {
    Write-Host "    Checking $friendlyName..."
    winget list --id $id --accept-source-agreements *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Installing $friendlyName..."
        winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -ne 0) { throw "winget install failed for $friendlyName ($id)" }
    } else {
        Write-Host "    $friendlyName already installed."
    }
}

Install-WithWinget "Git.Git" "Git"
Install-WithWinget "Python.Python.3.12" "Python 3.12"
Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
Install-WithWinget "PostgreSQL.PostgreSQL" "PostgreSQL"

# winget-installed tools may not be on PATH in this same session yet.
Write-Host "    Refreshing PATH for this session..."
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

foreach ($cmd in @("git", "python", "node", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: '$cmd' is still not on PATH after install. Close this PowerShell window,"
        Write-Host "       open a new elevated one, and re-run this script."
        exit 1
    }
}

# PostgreSQL's installer puts psql/pg_dump/pg_restore under a versioned bin dir
# that isn't always added to the machine PATH automatically.
$pgBinCandidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin" }
$pgBin = $pgBinCandidates | Where-Object { Test-Path (Join-Path $_ "psql.exe") } | Select-Object -First 1
if (-not $pgBin) {
    throw "Could not locate PostgreSQL's bin directory under C:\Program Files\PostgreSQL — installer layout may have changed."
}
if ($env:Path -notlike "*$pgBin*") {
    $env:Path = "$env:Path;$pgBin"
}
Write-Host "    Using PostgreSQL tools from: $pgBin"

# ── Step 2/9: nginx + NSSM (no winget packages — direct download) ────────────
Write-Host ""
Write-Host "==> Step 2/9: Installing nginx and NSSM..."

$toolsDir = "C:\DispatchTools"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$nginxDir = "C:\nginx"
if (-not (Test-Path (Join-Path $nginxDir "nginx.exe"))) {
    Write-Host "    Downloading nginx for Windows..."
    $nginxZip = Join-Path $toolsDir "nginx.zip"
    Invoke-WebRequest -Uri "https://nginx.org/download/nginx-1.29.0.zip" -OutFile $nginxZip
    Expand-Archive -Path $nginxZip -DestinationPath $toolsDir -Force
    $extracted = Get-ChildItem $toolsDir -Directory | Where-Object { $_.Name -like "nginx-*" } | Select-Object -First 1
    Move-Item $extracted.FullName $nginxDir
    Write-Host "    nginx installed to $nginxDir"
} else {
    Write-Host "    nginx already present at $nginxDir"
}

$nssmDir = "C:\nssm"
if (-not (Test-Path (Join-Path $nssmDir "nssm.exe"))) {
    Write-Host "    Downloading NSSM..."
    $nssmZip = Join-Path $toolsDir "nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip
    Expand-Archive -Path $nssmZip -DestinationPath $toolsDir -Force
    $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
    Copy-Item (Join-Path $toolsDir "nssm-2.24\$arch\nssm.exe") (Join-Path $nssmDir "nssm.exe")
    Write-Host "    NSSM installed to $nssmDir"
} else {
    Write-Host "    NSSM already present at $nssmDir"
}
$nssm = Join-Path $nssmDir "nssm.exe"

# ── Step 3/9: get the code ────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 3/9: Getting the code..."

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

$uploadDir = Join-Path $repoDir "uploads"

# ── Step 4/9: provision the database ─────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 4/9: Provisioning the database..."

$dbName = "dispatch"
$dbUser = "dispatch"

# The PostgreSQL Windows installer prompts interactively for a superuser
# ("postgres") password during winget install; there's no reliable way to
# retrieve it after the fact. Prompt here instead of guessing.
$pgSuperPassword = Read-Host -AsSecureString "Enter the PostgreSQL 'postgres' superuser password you set during install"
$pgSuperPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgSuperPassword))

$env:PGPASSWORD = $pgSuperPasswordPlain
$roleExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='$dbUser'" 2>$null
if ($roleExists.Trim() -eq "1") {
    Write-Host "    Postgres role '$dbUser' already exists — leaving it and the database untouched."
    $dbAlreadyProvisioned = $true
} else {
    function New-RandomHex([int]$bytes) {
        $buffer = New-Object byte[] $bytes
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $rng.GetBytes($buffer)
        -join ($buffer | ForEach-Object { $_.ToString("x2") })
    }
    $dbPassword = New-RandomHex 20
    & psql -U postgres -h localhost -c "CREATE USER $dbUser WITH PASSWORD '$dbPassword';"
    if ($LASTEXITCODE -ne 0) { throw "Failed to create Postgres role — check the superuser password." }
    & psql -U postgres -h localhost -c "CREATE DATABASE $dbName OWNER $dbUser;"
    Write-Host "    Created Postgres role and database '$dbName'."
    $dbAlreadyProvisioned = $false
}
Remove-Item Env:\PGPASSWORD

# ── Step 5/9: configure .env ──────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 5/9: Configuring .env..."

$envPath = Join-Path $repoDir ".env"
if (Test-Path $envPath) {
    $existingEnvContent = Get-Content $envPath -Raw
    if ($existingEnvContent -notmatch '(?m)^DATABASE_URL=') {
        throw ".env already exists here, but has no DATABASE_URL — it looks like a Docker-flavored .env (POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD, consumed by docker-compose.yml) rather than the DATABASE_URL this bare-metal install needs directly. Rename or remove the existing .env (back it up first if it's from a real Docker install!) and re-run, or add a correct DATABASE_URL line to it manually — see .env.example."
    }
    Write-Host "    .env already exists — leaving it untouched."
} else {
    if ($dbAlreadyProvisioned) {
        throw "Postgres role '$dbUser' already existed, but no .env was found here, so this script doesn't know its password. Either drop the existing role and re-run, or create .env manually (see .env.example)."
    }
    function New-RandomHex2([int]$bytes) {
        $buffer = New-Object byte[] $bytes
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $rng.GetBytes($buffer)
        -join ($buffer | ForEach-Object { $_.ToString("x2") })
    }
    $secretKey = New-RandomHex2 32

    $uploadDirForward = $uploadDir -replace '\\', '/'

    @"
DATABASE_URL=postgresql://${dbUser}:${dbPassword}@localhost:5432/${dbName}
SECRET_KEY=$secretKey
UPLOAD_DIR=$uploadDirForward
PORTAL_PORT=$PortalPort
"@ | Set-Content -Path $envPath -Encoding ascii

    Write-Host "    Generated .env with a random SECRET_KEY and Postgres password."
    Write-Host "    See .env.example for the full list of optional settings — copy over anything you need, then restart the DispatchBackend service."
}

# ── Step 6/9: backend (venv, deps, migrations) ───────────────────────────────
Write-Host ""
Write-Host "==> Step 6/9: Setting up the backend (Python venv, dependencies, migrations)..."

if (-not (Test-Path "backend\venv")) {
    python -m venv backend\venv
}
& backend\venv\Scripts\pip.exe install --upgrade pip | Out-Null
& backend\venv\Scripts\pip.exe install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

New-Item -ItemType Directory -Force -Path (Join-Path $uploadDir "documents") | Out-Null

Push-Location backend
& .\venv\Scripts\python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "alembic upgrade failed" }
Pop-Location
Write-Host "    Migrations applied."

# ── Step 7/9: NSSM service for the backend ───────────────────────────────────
Write-Host ""
Write-Host "==> Step 7/9: Installing the DispatchBackend service..."

$pythonExe = Join-Path $repoDir "backend\venv\Scripts\python.exe"
$backendDir = Join-Path $repoDir "backend"

& $nssm stop DispatchBackend *> $null
& $nssm remove DispatchBackend confirm *> $null

# python-dotenv's load_dotenv() (called by backend/app/config.py and
# backend/migrations/env.py) walks UP from the calling file's own directory
# looking for .env — not from the process's cwd — so it finds the repo-root
# .env correctly even with AppDirectory set to backend\ below. Verified
# directly (not just assumed) before relying on it here.
& $nssm install DispatchBackend $pythonExe "-m gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:8000"
& $nssm set DispatchBackend AppDirectory $backendDir
& $nssm set DispatchBackend AppExit Default Restart
& $nssm set DispatchBackend AppRestartDelay 3000
& $nssm set DispatchBackend Start SERVICE_AUTO_START
& $nssm start DispatchBackend
Write-Host "    DispatchBackend service installed and started."

# ── Step 8/9: build the frontend ─────────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 8/9: Building the frontend (npm ci && npm run build)..."
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
Write-Host "    Built to $repoDir\dist"

# ── Step 9/9: nginx config + service ──────────────────────────────────────────
Write-Host ""
Write-Host "==> Step 9/9: Configuring nginx..."

$distPathForward = (Join-Path $repoDir "dist") -replace '\\', '/'

$staffConf = @"
server {
    listen 80;
    server_name _;
    root $distPathForward;
    index index.html;

    client_max_body_size 25m;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location /api/ {
        proxy_pass         http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host `$host;
        proxy_set_header   X-Real-IP `$remote_addr;
        proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    location / {
        try_files `$uri `$uri/ /index.html;
    }
}
"@

$portalConf = @"
server {
    listen $PortalPort;
    server_name _;
    root $distPathForward;
    index portal.html;

    client_max_body_size 1m;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location /api/portal/ {
        proxy_pass         http://127.0.0.1:8000/api/portal/;
        proxy_http_version 1.1;
        proxy_set_header   Host `$host;
        proxy_set_header   X-Real-IP `$remote_addr;
        proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/portal-branding/public {
        proxy_pass         http://127.0.0.1:8000/api/portal-branding/public;
        proxy_http_version 1.1;
        proxy_set_header   Host `$host;
        proxy_set_header   X-Real-IP `$remote_addr;
        proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/payments/webhook {
        proxy_pass         http://127.0.0.1:8000/api/payments/webhook;
        proxy_http_version 1.1;
        proxy_set_header   Host `$host;
        proxy_set_header   X-Real-IP `$remote_addr;
        proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/inbound-email/ {
        proxy_pass         http://127.0.0.1:8000/api/inbound-email/;
        proxy_http_version 1.1;
        proxy_set_header   Host `$host;
        proxy_set_header   X-Real-IP `$remote_addr;
        proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /api/ {
        return 404;
    }

    location /p/ {
        try_files `$uri `$uri/ /portal.html;
    }

    location / {
        try_files `$uri /portal.html;
    }
}
"@

$staffConf | Set-Content -Path (Join-Path $nginxDir "conf\dispatch.conf") -Encoding ascii
$portalConf | Set-Content -Path (Join-Path $nginxDir "conf\dispatch-portal.conf") -Encoding ascii

$mainConfPath = Join-Path $nginxDir "conf\nginx.conf"
$mainConf = Get-Content $mainConfPath -Raw
if ($mainConf -notmatch '(?m)^\s*include\s+dispatch\.conf\s*;') {
    # Insert an include for our two site configs inside the existing http {} block,
    # right after its opening brace.
    $mainConf = $mainConf -replace "(http\s*\{)", "`$1`n    include dispatch.conf;`n    include dispatch-portal.conf;"
    $mainConf | Set-Content -Path $mainConfPath -Encoding ascii
    Write-Host "    Added dispatch site includes to $mainConfPath"
}

& $nssm stop nginx *> $null
& $nssm remove nginx confirm *> $null
& $nssm install nginx (Join-Path $nginxDir "nginx.exe")
& $nssm set nginx AppDirectory $nginxDir
& $nssm set nginx AppExit Default Restart
& $nssm set nginx Start SERVICE_AUTO_START

& (Join-Path $nginxDir "nginx.exe") -t
& $nssm start nginx
Write-Host "    nginx configured and started as a Windows service."

Write-Host ""
Write-Host "=================================================================="
Write-Host " Done."
Write-Host ""
& $nssm status DispatchBackend
& $nssm status nginx
Write-Host ""
Write-Host " Open http://localhost — the setup wizard runs on first boot to create"
Write-Host " your admin account. The client portal is at http://localhost:$PortalPort"
Write-Host ""
Write-Host " Backend logs: check Windows Event Viewer, or run 'nssm status DispatchBackend'"
Write-Host " Restart backend: nssm restart DispatchBackend"
Write-Host "=================================================================="
