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

## Phase 7 — Invoice & Billing Improvements (Complete)
- [x] Invoice PDF export — branded print-ready HTML invoice, opens in new tab
- [x] Invoice email — send invoice to client email with optional message; auto-promotes Draft → Sent
- [x] Payment tracking — record partial/full payments (method, date, note); auto-marks Paid; balance shown
- [x] Invoice number sequence — auto-increment invoice numbers (INV-2026-00001) [was already done in Phase 5]
- [x] Client statement — summary modal per client: all invoices, total billed, total paid, outstanding
- [x] Multi-ticket invoicing — one invoice covers many tickets; unbilled ticket picker scoped to client; billing_status on tickets (unbilled → invoiced → paid); bulk mark-paid; Alembic migration 0018

## Phase 8 — Document Library & Ticket Playbooks (Complete)
- [x] Document model — name, description, category (internal / client-facing), ticket_type tags (multi), free-form tags, requires_signature flag, stored in uploads volume
- [x] Alembic migration 0009 — documents table
- [x] Documents API — upload, list, get, update metadata, delete (admin only for delete/update)
- [x] Document Library page — Settings > Document Library tab (admin); upload modal, edit modal, filter by category/ticket type/search, download, delete
- [x] Ticket "Playbook & Documents" section — surfaces matched docs by ticket type; split Internal / Client-Facing; download button on each; requires_signature indicator
- [x] Future hook: requires_signature flag in data model and UI; signed copy upload slot for later e-sign wiring

## Phase 9 — Client Portal (Complete)
- [x] Client-facing portal at `/portal` — separate SPA with its own Vite entry point and React app
- [x] Portal auth — separate JWT (`type: "portal"`), rate-limited login, refresh rotation, auto-logout
- [x] Portal ticket list — clients see only their tickets (scoped by `client_id`)
- [x] Portal ticket detail — read-only view with status, priority, description, SLA
- [x] Portal ticket submission — clients can open new tickets from the portal
- [x] Portal invoices — list and detail with payments, balance, and PDF download
- [x] Admin portal account management — Settings > Client Portal tab; create/edit/disable/delete accounts
- [x] `ClientPortalUser` + `PortalRefreshToken` models — migration 0014
- [x] Backend router: `/api/portal/auth/*`, `/api/portal/tickets`, `/api/portal/invoices`, `/api/portal/accounts`
- [x] nginx `/portal` location block serving `portal.html` for SPA routing

## Phase 10 — Reporting (Complete)
- [x] Revenue report — total billed per month, breakdown by client, outstanding balance; stat cards
- [x] Technician report — tickets resolved and hours logged per technician over date range
- [x] SLA compliance report — % tickets resolved within SLA per priority over a date range
- [x] Export all three reports as CSV
- [x] Reports page — top-level nav in classic and new UI (admin only)
- [x] `GET/api/reports/revenue`, `/technician`, `/sla` — all with `/csv` variants
- [x] 16 new backend tests (164 total)

## Form Templates & Ticket Forms (Complete)
- [x] FormTemplate + FormInstance models + Alembic migration 0010
- [x] CRUD API: /api/form-templates, /api/tickets/{id}/form-instances, /api/form-instances/{id}
- [x] Form Templates tab on Documents page (admin: build/edit/delete templates with field builder)
- [x] Forms section on ticket editor: matching templates shown, fill/save/edit/print per ticket
- [x] 17 new backend tests (181 total)
- [x] Fixed Axios Content-Type bug blocking document uploads
- [x] Bulk drag-and-drop upload on Documents page

## Update Notifications (Complete)
- [x] VERSION file at repo root (1.0.0)
- [x] GITHUB_REPO + GITHUB_TOKEN in config.py + .env.example
- [x] GET /api/version/check — GitHub releases API, server-side PAT, 10-min cache
- [x] UpdateBanner component — polls every 10 min, dismissible, shows upgrade instructions
- [x] 5 new backend tests (186 total)

## Phase 11 — Suite Integration (Optional)
- [ ] Pulse alert → auto-create ticket via webhook
- [ ] Tether asset link on ticket (lookup by asset tag)
- [ ] Shared ATech Solutions nav/header across suite apps

## Phase 12 — Completeness: Tier 1 (Highest impact)
- [x] Email-to-ticket (inbound intake) — client emails support@ become tickets; replies thread onto the same ticket via inbound webhook (Postmark-compatible), matching the `[TKT-...]` tag in the subject line (v1.14.0)
- [x] Recurring / retainer invoicing — recurring invoice schedules for monthly managed-services retainers; reuses `next_run_after()` scheduler; auto-generate + optional auto-send (admin only) (v1.15.0)
- [x] Scheduling / dispatch calendar — day/week calendar, drag tickets onto technician time slots to create appointments (independent of ticket assignment); notifies technician + logs to ticket audit trail (v1.16.0). Deferred: tech availability/working-hours modeling, double-booking conflict detection.

## Phase 13 — Completeness: Tier 2 (Strong value)
- [x] Live time tracking — start/stop timer on tickets that writes to `hour_logs` instead of manual hour entry (v1.10.0)
- [x] Audit log — immutable activity trail (who changed status/assignee/price/fields, when); separate from comments (v1.9.0)
- [x] Online payments — Stripe "Pay now" link on invoices + portal so clients self-serve payment. Portal Pay Now button (v1.8.1) now creates a real Stripe Checkout session and a webhook auto-records payment + marks invoices Paid (v1.12.0). Full-balance-only in this release, no partial payments/fee pass-through.
- [x] AR aging report — 30/60/90 overdue receivables breakdown (the reporting gap) (v1.11.0)
- [x] In-app notification center — bell/feed so techs see assignments + mentions without relying on email (v1.13.0; simple "internal comment on your ticket" rule, not full @mention parsing)

## Feature toggles (Complete)
- [x] Six `FEATURE_*` env vars for Phase 12/13 additions (audit log, timer, AR aging, notifications, recurring invoicing, scheduling) — all default enabled, 503 when disabled, `/api/config` endpoint (v1.17.0)

## Phase 14 — Completeness: Tier 3 (Polish & parity)
- [x] Quotes/estimates — send a quote that converts to an invoice on approval; status flow Draft/Sent/Approved/Rejected/Expired; toggleable via `FEATURE_QUOTES` (v1.18.0)
- [x] Two-factor auth (2FA) for staff logins — TOTP enrollment via QR code, 10 backup codes, two-step login flow; toggleable via `FEATURE_2FA` (default **disabled**, unlike every other toggle) (v1.23.0)
- [x] Global search — topbar search across tickets, clients, invoices, and quotes; toggleable via `FEATURE_GLOBAL_SEARCH` (v1.19.0)
- [x] Canned responses / macros — admin-managed library of reusable comment snippets, insertable into the ticket comment box; toggleable via `FEATURE_CANNED_RESPONSES` (v1.20.0)
- [x] SLA-breach escalation — background check notifies assignee (or all admins if unassigned) once per breach, reuses existing SLA deadline computation; toggleable via `FEATURE_SLA_ESCALATION` (v1.21.0). Note: notifies, does not auto-reassign — reassignment was judged riskier than useful without a defined escalation policy
- [x] Per-client SLA tiers — optional Gold/Silver/Bronze override of the global per-priority SLA table, set on the business's primary client record; toggleable via `FEATURE_SLA_TIERS` (v1.22.0)
