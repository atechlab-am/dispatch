# Dispatch

Internal ticketing system for ATechSolutions.

## Run

```bash
cp .env.demo .env
docker compose up -d --build
```

Open **http://localhost** — the setup wizard runs on first boot to create your admin account.

```bash
docker compose down      # stop (database preserved)
docker compose down -v   # stop + wipe database
```

## Upgrade (production)

```bash
sudo ./upgrade.sh
```

Pulls latest code, rebuilds images without cache, restarts containers. Database is never touched.

## Stack

React 18 + Vite · FastAPI · PostgreSQL · nginx · Docker

## Features

- **Tickets** — create, edit, delete; search and filter by status; PDF export per ticket
- **Clients** — full client directory with add/edit/delete and search
- **Invoices** — create invoices manually or directly from a ticket; line items, tax presets, status tracking (Draft / Sent / Paid / Void)
- **SLA tracking** — response and resolution deadlines per priority (Urgent 1h/4h · High 4h/8h · Medium 8h/24h · Low 24h/72h); countdown badges on ticket list; dual progress bar in ticket editor
- **Dashboard** — stat cards (total, active, resolved, urgent, SLA breached, SLA warning); priority and status charts; My Active Tickets, SLA at Risk, Recent Open sections; all cards and sections are clickable and navigate to filtered ticket list
- **Export** — download tickets as CSV with filters by status, priority, client name, and date range
- **Document Library** — upload, tag, and manage internal and client-facing documents (PDF, Word, images, etc.); filter by category and ticket type; ticket editor surfaces matched documents as a Playbook section
- **Reports** — admin-only reporting page: revenue by month and client, technician performance (tickets resolved, hours, labour), SLA compliance % by priority; all reports have date-range filters and CSV export
- **Users** — admin user management; self-service password change
- **Setup wizard** — first-boot admin account creation
