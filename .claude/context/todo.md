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
- [x] Tests: pricing helpers + `esc()` — 27 tests passing
- [x] Add `setup.md` with dev and Docker setup instructions
- [x] Add `CHANGELOG.md`
- [ ] Tests: `TicketList` search and filter behaviour
- [ ] Tests: `TicketEditor` save and delete

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
- [x] Backend tests: 25 passing (auth, tickets CRUD, user management, permission enforcement)
- [x] Frontend build: passes (`npm run build`)
- [x] Frontend tests: 22 passing (`npm run test:run`)

## Phase 3 — User Management UI

Goal: 1–2 users at launch; admin can add/remove users from the UI without touching the DB.

- [ ] `GET  /api/users` — list users (admin only)
- [ ] `POST /api/users` — create user (admin only)
- [ ] `PUT  /api/users/{id}` — update name/email/role/password (admin only)
- [ ] `DELETE /api/users/{id}` — deactivate user (admin only)
- [ ] `PUT  /api/users/me/password` — self-service password change
- [ ] Settings page in UI: Users tab — list, invite/add, deactivate
- [ ] Role system: `admin` (full access) | `technician` (no user management)
- [ ] Permission flags per user stored in DB (groundwork for finer-grained control later)

## Phase 4 — Quality & Hardening

- [ ] Rate limiting on `/api/auth/login` (slowapi)
- [ ] `SECRET_KEY` strength validation at startup (refuse to start if default/weak)
- [ ] HTTPS + production nginx config (Let's Encrypt / cert mount)
- [ ] `npm audit` + `pip-audit` clean in CI
- [ ] Frontend component tests: TicketList filter/search, TicketEditor save/delete
- [ ] Backend tests: auth rate limiting, permission enforcement

## Phase 5 — Suite Integration

- [ ] Pulse alert → auto-create ticket via webhook
- [ ] Tether asset link on ticket (lookup by asset tag)
- [ ] Shared ATech Solutions nav/header across suite apps
