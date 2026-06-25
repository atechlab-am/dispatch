# Dispatch

Internal ticketing system for ATechSolutions.

## Run

```bash
cp .env.demo .env
docker compose up -d --build
```

Open **http://localhost** — the setup wizard runs on first boot to create your admin account.

```bash
docker compose down      # stop
docker compose down -v   # stop + wipe database
```

## Stack

React 18 + Vite · FastAPI · PostgreSQL · nginx · Docker
