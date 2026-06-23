# ATechSolutions — Ticket Manager

Internal ticketing system for ATechSolutions.

## Quick Start (Docker)

```bash
# Clone / extract the project folder, then:
docker compose up -d --build
```

Open **http://localhost:3000** in your browser.

To stop:
```bash
docker compose down
```

## Run on a Different Port

Edit `docker-compose.yml` and change the left side of the port mapping:

```yaml
ports:
  - "8080:80"   # now accessible at http://localhost:8080
```

## Local Dev (no Docker)

Requires Node 20+.

```bash
npm install
npm run dev
```

App runs at **http://localhost:5173**

## Build Only

```bash
npm run build   # outputs to /dist
```

## Notes

- Tickets are **session-only** in this version — refreshing the page clears all data.
  Persistence (PostgreSQL backend) is planned as phase two.
- PDF export opens a print dialog via the browser's built-in print.
- Business and Residential rates are loaded from the ATechSolutions service catalogue.
