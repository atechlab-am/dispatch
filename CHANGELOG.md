# Changelog

All notable changes to Dispatch are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added — Phase 2 (FastAPI + PostgreSQL + Auth)
- `backend/` — FastAPI app: auth, tickets, users routers; SQLAlchemy models; first-boot admin seed
- `docker-compose.yml` — postgres:16-alpine + backend + frontend, all health-checked
- nginx proxies `/api/` → `backend:8000`; SPA fallback unchanged
- `.env.example` — full env var reference
- `src/api/client.js` — Axios instance with JWT inject, transparent refresh rotation, auto-logout on 401
- `src/api/auth.js`, `src/api/tickets.js` — API wrappers
- `src/LoginPage.jsx` — login screen shown when unauthenticated
- Toast notifications, loading states, logout button in nav
- Backend test suite: 25 tests covering auth, tickets CRUD, and user management (pytest + FastAPI TestClient + SQLite)

### Changed — Phase 2
- App.jsx fully wired to API — ticket state no longer session-only
- Nav shows current user name and role; `Sign out` triggers `/api/auth/logout`

### Added
- `.claude/context/` project guidelines (caveman mode, edit permission, docs/tests/memory/todo sync rules, security standards, project overview, test runner docs)
- `CHANGELOG.md` (this file)
- `setup.md` — dev and Docker setup instructions

### Fixed
- XSS: HTML-escape all user-supplied ticket fields in `printTicket()` PDF template

### Changed
- Configured Vitest + React Testing Library for unit tests (`src/__tests__/`)
- Removed `newId`, `newTicket`, `calcGrandTotal` from `helpers.js` — ID/ticket creation moves to the backend in Phase 2; grand total stays inline in component
- Removed `blueLight` unused brand token
- Removed hardcoded personal email from nav (will come from auth token in Phase 2)
- App shell state handlers (`handleNew`, `handleSave`, `handleDelete`) annotated with `TODO(Phase 2)` wiring points
- Test suite updated to match (22 tests passing)

---

## [1.0.0] — 2026-06-01

### Added
- Initial release: React SPA ticketing system for ATechSolutions
- Business and residential service catalogues with flat, per-unit, and hourly pricing types
- Ticket list with stats dashboard, search, and status filter
- Ticket editor: client info, issue details, services, hour logs, travel fee, internal notes
- PDF/print export via browser print API (`printTicket`)
- Docker + nginx deployment (`Dockerfile`, `docker-compose.yml`)
