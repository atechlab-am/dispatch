# Dispatch — Todo

## Phase 1 — Core SPA (Complete)
- [x] Ticket list with stats, search, and status filter
- [x] Ticket editor with services, hour logs, travel fee
- [x] PDF/print export via browser print API
- [x] Business and residential service catalogues
- [x] Docker + nginx deployment
- [x] Set up .claude/context/ project guidelines

## Phase 1.5 — Quality & Tests (Complete)
- [x] Configure Vitest + React Testing Library
- [x] Extract helpers to `src/helpers.js`
- [x] Fix XSS: escape all user values in `printTicket()` HTML template via `esc()`
- [x] Tests: pricing helpers + `esc()` — 22 tests passing
- [x] Add `setup.md` with dev and Docker setup instructions
- [x] Add `CHANGELOG.md`

## Phase 2 — FastAPI Backend + PostgreSQL (Complete)
- [x] `backend/` scaffold: FastAPI app, `requirements.txt`, `Dockerfile`
- [x] `docker-compose.yml`: postgres:16-alpine + backend + frontend services, health checks
- [x] nginx proxies `/api/` → `backend:8000`
- [x] `.env.example` with all required vars
- [x] SQLAlchemy models: `User`, `RefreshToken`, `Ticket`, `ServiceLine`, `HourLog`
- [x] First-boot admin seed from env vars (`FIRST_ADMIN_*`)
- [x] Auth API: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- [x] Tickets API: list (search + status filter), create, get, update, delete
- [x] Users API: list, create, update, deactivate (admin only); self-service password change
- [x] Frontend: `src/api/client.js` (Axios + JWT inject + refresh rotation + auto-logout on 401)
- [x] Frontend: `LoginPage.jsx`, logout button, toast notifications, loading states
- [x] App.jsx fully wired to API — no session-only state
- [x] Backend tests: 35 passing
- [x] Frontend build: passes (`npm run build`)
- [x] Frontend tests: 36 passing (`npm run test:run`)

## Phase 3 — User Management UI (Complete)
- [x] `src/api/users.js` — API wrappers for user CRUD + password change
- [x] `src/SettingsPage.jsx` — Users tab (admin: list/add/edit/deactivate) + Change Password tab (all users)
- [x] Settings nav button in App.jsx; logo click returns to ticket list
- [x] Fixed route ordering: `PUT /me/password` registered before `PUT /{user_id}`
- [x] Added `active: bool` to `UserOut` schema
- [x] Backend tests: 4 new (active field, password change, wrong password, unauthenticated)
- [x] `backend/app/schemas.py` — `UserOut` updated with `active` field

## Phase 4 — First-Run Setup + Quality & Hardening (Complete)
- [x] First-run setup wizard: `GET /api/setup/status` + `POST /api/setup/complete`
- [x] `src/SetupPage.jsx` — setup wizard shown when no admin exists
- [x] App.jsx checks setup status on first load; gates login behind setup
- [x] Rate limiting on `/api/auth/login` (slowapi — 10 req/min per IP)
- [x] `SECRET_KEY` strength validation at startup (refuses to start if missing/weak/placeholder)
- [x] HTTPS production nginx config (`nginx.prod.conf`) + `docker-compose.prod.yml` overlay with cert mount
- [x] `npm audit` clean — upgraded Vite 6.x, Vitest 3.x, jsdom 25
- [x] `pip-audit` clean — upgraded fastapi, starlette, python-jose, python-multipart, python-dotenv, pytest, pytest-asyncio, httpx2
- [x] Frontend component tests: SetupPage (5) + SettingsPage (9) — 36 total
- [x] Backend tests: setup wizard (6) — 35 total

## Docker-only (Complete)
- [x] Multi-stage Dockerfiles: `test` + `production` targets for both frontend and backend
- [x] `docker-compose.yml` targets `production` stage
- [x] `docker-compose.test.yml` — run all tests inside Docker, no local deps
- [x] Fixed backend healthcheck: `python` → `python3`
- [x] `setup.md` + `README.md` — removed all local-dev install instructions; tests now use Docker commands

## Production Hardening (Complete)
- [x] Fix `Ticket.updated_at` onupdate — timezone-aware lambda
- [x] CORS allowed origins from `ALLOWED_ORIGINS` env var
- [x] Backend Dockerfile: non-root user + gunicorn with uvicorn workers
- [x] Frontend Dockerfile: `npm ci` instead of `npm install`
- [x] nginx: `client_max_body_size 10m`
- [x] Refresh token cleanup: hourly background task purges expired rows
- [x] Health endpoint: DB liveness check (SELECT 1), returns 503 on failure
- [x] Structured JSON logging via custom `logging.Formatter`
- [x] `.env.example`: documented `ALLOWED_ORIGINS` and `WEB_CONCURRENCY`
- [x] Alembic migrations — `migrations/` directory with `env.py`, `script.py.mako`, initial migration `0001_initial_schema.py`; startup runs `alembic upgrade head`

## Phase 5 — Clients, Invoices, SLA, Dashboard, Export (Complete)
- [x] Clients page — top-level nav, full CRUD with search
- [x] Invoices page — top-level nav, line items, tax presets, status filter
- [x] Create invoice from ticket — pre-populated with services/labour/travel
- [x] SLA tracking — deadlines per priority, countdown badge, progress bar panel
- [x] Dashboard home — stat cards, charts, My Active Tickets, SLA at Risk, Recent Open
- [x] Clickable dashboard — stat cards and section buttons navigate to filtered ticket list
- [x] Ticket export — CSV download with status/priority/client/date filters
- [x] Alembic migrations 0003–0005 (clients, invoices, SLA columns)
- [x] upgrade.sh — one-command production upgrade script

## Phase 6 — Ticket Improvements
- [x] Ticket comments — timestamped notes with internal flag; client notified on non-internal comments via email
- [x] Ticket assignment — assign to technician; assignee filter in ticket list; assignee shown on ticket row
- [x] Email notifications — client + assignee notified on ticket create, status change, and new comment (SMTP optional via env)
- [x] Ticket templates — save ticket as template; apply template when creating a new ticket
- [x] File attachments on tickets — upload screenshots or documents (stored in Docker volume, 10 MB limit)
- [x] Recurring tickets — schedule a ticket to auto-create on a repeating interval (daily/weekly/monthly/quarterly)

## Phase 7 — Invoice & Billing Improvements
- [ ] Invoice PDF export — generate a branded PDF invoice (same style as ticket PDF)
- [ ] Invoice email — send invoice directly to client email from within the app
- [ ] Payment tracking — record partial payments against an invoice
- [ ] Invoice number sequence — auto-increment invoice numbers (INV-2026-00001)
- [ ] Client statement — summary view of all invoices and outstanding balance per client

## Phase 8 — Client Portal (Future)
- [ ] Client-facing portal — read-only view where clients can see their own tickets and invoices
- [ ] Client login — separate auth flow for client accounts (non-admin, scoped to their data)
- [ ] Client ticket submission — clients can open new tickets via the portal

## Phase 9 — Reporting
- [ ] Revenue report — total billed per month/quarter, breakdown by client and service type
- [ ] Technician report — tickets resolved and hours logged per technician
- [ ] SLA compliance report — % tickets resolved within SLA per priority over a date range
- [ ] Export reports as CSV or PDF

## Phase 10 — Suite Integration
- [ ] Pulse alert → auto-create ticket via webhook
- [ ] Tether asset link on ticket (lookup by asset tag)
- [ ] Shared ATech Solutions nav/header across suite apps
