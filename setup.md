# Dispatch — Setup

Internal ticketing system for ATechSolutions.

---

## Quick Start (Docker)

```bash
docker compose up -d --build
```

Open **http://localhost:3000**.

```bash
docker compose down   # stop
```

## Local Dev

Requires Node 20+.

```bash
npm install
npm run dev
```

App runs at **http://localhost:5173**.

## Build

```bash
npm run build   # outputs to /dist
```

## Tests

```bash
npm test            # Vitest watch mode
npm run test:run    # single CI run
npm run test:coverage
```

## Run on a Different Port

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:80"   # accessible at http://localhost:8080
```

## Notes

- Tickets are **session-only** — refreshing the page clears all data. PostgreSQL persistence is planned for Phase 2.
- PDF export uses the browser's built-in print dialog.
- Service rates are loaded from the ATechSolutions service catalogue defined in `src/App.jsx`.
