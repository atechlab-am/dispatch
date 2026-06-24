# Running Tests

## Frontend (Vitest)
```bash
npm run test:run    # single CI run  (22 tests)
npm test            # watch mode
npm run test:coverage
```
Test files: `src/__tests__/`. No server needed.

## Backend (pytest)
```bash
cd backend
python3 -m pytest tests/ -v --tb=short   # 25 tests
```
Uses a temporary SQLite file — no PostgreSQL needed for tests. Patches `app.database.engine` before import so the FastAPI lifespan uses the same test DB.

## Stacks
- **Frontend**: Vitest + React Testing Library + jsdom
- **Backend**: pytest + FastAPI TestClient + SQLAlchemy (SQLite file-based fixture)
