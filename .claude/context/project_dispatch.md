# Dispatch — Project Overview

## What is this
Internal ticketing system for ATechSolutions. Technicians create and manage service tickets, log hours, and export client-facing PDFs. Part of the ATech Solutions suite alongside Tether (asset mgmt), Pulse (monitoring), and Nexus (docs). Suite integration is an optional future phase — Dispatch currently runs independently.

**Brand colours:**
- Blue: `#1A5CBA` (primary)
- Accent: `#E8A020` (amber)
- Background: `#F4F7FC`

**Tagline:** "Service tickets, done fast."

## Stack
- **Frontend**: React 18 + Vite, vanilla JSX (no router, no state lib)
- **Backend**: FastAPI + SQLAlchemy (sync) + PostgreSQL (psycopg2-binary)
- **Auth**: JWT — 30-min access tokens + 7-day refresh tokens with rotation; tokens in memory only (never localStorage)
- **PDF export**: Browser print API via `window.open()` + `window.print()`
- **Tests**: Vitest + React Testing Library (frontend) | pytest + FastAPI TestClient + SQLite (backend)
- **Containerisation**: Docker + nginx; docker-compose with postgres:16-alpine + backend + frontend

## Repository Layout
```
dispatch/
├── README.md / CHANGELOG.md / setup.md
├── .env.example
├── .claude/context/       # Claude AI context files
├── Dockerfile             # Frontend (nginx)
├── docker-compose.yml     # postgres + backend + frontend
├── nginx.conf
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.jsx
│   ├── App.jsx            # App shell, all ticket state/handlers, nav
│   ├── LoginPage.jsx      # Login form
│   ├── SetupPage.jsx      # First-run setup wizard
│   ├── SettingsPage.jsx   # Users tab (admin) + Change Password tab
│   ├── helpers.js         # fmt, esc, calcServiceTotal, calcHourTotal
│   └── api/
│       ├── client.js      # Axios instance + JWT inject + refresh rotation
│       ├── auth.js        # login, logout, me
│       ├── tickets.js     # CRUD wrappers
│       └── users.js       # listUsers, createUser, updateUser, deactivateUser, changeOwnPassword
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    └── app/
        ├── main.py        # FastAPI app, CORS, lifespan (DB init + admin seed)
        ├── config.py      # Env vars: DATABASE_URL, SECRET_KEY, FIRST_ADMIN_*
        ├── database.py    # Engine, SessionLocal, Base, get_db()
        ├── security.py    # JWT encode/decode, bcrypt, get_current_user, require_admin
        ├── schemas.py     # Pydantic v2 schemas
        ├── models/
        │   └── models.py  # User, RefreshToken, Ticket, ServiceLine, HourLog
        ├── routers/
        │   ├── auth.py    # /api/auth/login, /refresh, /me, /logout
        │   ├── tickets.py # /api/tickets CRUD
        │   ├── users.py   # /api/users CRUD + /me/password
        │   └── setup.py   # /api/setup/status, /api/setup/complete
        └── tests/
            ├── conftest.py
            ├── test_auth.py
            ├── test_tickets.py
            ├── test_users.py
            └── test_setup.py
```

## Key Concepts
| Concept | Notes |
|---|---|
| Ticket | Core entity — client info, services, hour logs, travel fee, status, priority |
| Service | From SERVICES catalogue (business or residential); types: flat / per_unit / hourly |
| Hour log | Time entry with date, hours, rate, description — linked to a ticket |
| Travel fee | Fixed fee options: none / within 15km / 15–30km / 30+km |
| Client type | `business` or `residential` — controls service catalogue |
| User | Role: `admin` (full access) or `technician` (no user mgmt) |
| Setup wizard | Shown on first boot when no admin exists; creates initial admin account |

## Auth Flow
1. App loads → `GET /api/setup/status` → if not set up, show SetupPage
2. After setup (or if already set up) → show LoginPage
3. Login → access token (memory) + refresh token (memory); auto-refresh on 401
4. Tokens never written to localStorage/sessionStorage

## API Routing
- `/api/auth/*` — login, logout, refresh, me
- `/api/tickets/*` — ticket CRUD
- `/api/users/*` — user management (admin) + `/me/password` (all)
- `/api/setup/*` — first-run setup (unauthenticated, locked after first admin created)

## Service Catalogue
Two catalogues in `SERVICES` constant in `App.jsx`:
- `business` — ~30 services: flat, per_unit, and hourly types
- `residential` — ~10 services: hourly and per_unit

## Ticket Lifecycle
Status: `Open` → `In Progress` → `Awaiting Client` → `Resolved` → `Closed`
Priority: `Low` | `Medium` | `High` | `Urgent`

## Pricing Logic
- `calcServiceTotal(svc)` — computes subtotal per service line
- `calcHourTotal(logs)` — sums all hour log entries
- Grand total computed inline in `TicketEditor`
- `printTicket(ticket)` — generates escaped, print-ready HTML

## Environment / Deployment
- Dev frontend: `npm run dev` → http://localhost:5173
- Dev backend: `cd backend && uvicorn app.main:app --reload` → http://localhost:8000
- Docker (full stack): `docker compose up -d --build` → http://localhost:3000
- Build: `npm run build` → `/dist`

## Phase Status
| Phase | Status |
|---|---|
| 1 — Core ticketing SPA | ✅ Complete |
| 1.5 — Quality & tests | ✅ Complete |
| 2 — FastAPI + PostgreSQL backend | ✅ Complete |
| 3 — User management UI | ✅ Complete |
| 4 — First-run setup + hardening | 🔄 In Progress |
| 5 — Suite integration (Tether/Pulse) | 🔲 Optional / Future |
