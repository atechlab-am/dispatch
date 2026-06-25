# Running Tests

## Frontend (Vitest)
```bash
npm run test:run    # single CI run  (36 tests)
npm test            # watch mode
npm run test:coverage
```
Test files: `src/__tests__/`. No server needed.

## Backend (pytest)
```bash
cd backend
python3 -m pytest tests/ -v --tb=short   # 35 tests
```
Uses a temporary SQLite file — no PostgreSQL needed for tests. Patches `app.database.engine` before import so the FastAPI lifespan uses the same test DB.

## Stacks
- **Frontend**: Vitest 3 + React Testing Library + jsdom 25
- **Backend**: pytest 9 + FastAPI TestClient + SQLAlchemy (SQLite file-based fixture)

## Audit
```bash
# Frontend (no vulnerabilities)
npm audit

# Backend (exclude psycopg2 — requires pg_config, only builds in Docker)
grep -v psycopg2 backend/requirements.txt > /tmp/req_no_pg.txt
python3 -m pip_audit -r /tmp/req_no_pg.txt
```

## Test files
| File | Tests | Coverage |
|---|---|---|
| `src/__tests__/helpers.test.js` | 22 | `fmt`, `esc`, `calcServiceTotal`, `calcHourTotal` |
| `src/__tests__/SetupPage.test.jsx` | 5 | Setup wizard form validation, submit, API error |
| `src/__tests__/SettingsPage.test.jsx` | 9 | Users tab (admin), Change Password tab |
| `backend/tests/test_auth.py` | 8 | Login, refresh, logout, me, bad token |
| `backend/tests/test_tickets.py` | 11 | CRUD, ID format, search, filter, auth enforcement |
| `backend/tests/test_users.py` | 10 | Admin CRUD, password change, active field, auth |
| `backend/tests/test_setup.py` | 6 | Setup status, lock, fresh DB, short password |
