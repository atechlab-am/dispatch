# Dispatch

Internal ticketing and client management system for ATechSolutions.

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

Pulls latest code, rebuilds images without cache, restarts containers. Database migrations run automatically on startup.

## Stack

React 18 + Vite · FastAPI · PostgreSQL · nginx · Docker

## Features

### Tickets
- Create, edit, delete tickets with status, priority, client, and technician assignment
- Search and filter by status, priority, assigned technician
- PDF export per ticket; CSV bulk export (admin only)
- **SLA tracking** — response and resolution deadlines per priority:
  - Urgent: 1h / 4h (wall-clock, 24/7)
  - High: 4h / 8h · Medium: 8h / 24h · Low: 24h / 72h (business hours Mon–Fri, weekends skipped)
- Countdown badges on ticket list; dual progress bar in ticket editor
- SLA pauses automatically when status is set to Awaiting Client or On Hold; resumes and extends deadlines when work restarts
- Playbook section in ticket editor surfaces matched documents by ticket type
- **Activity/audit log** — immutable trail of who changed status, assignee, price, or other fields, and when; separate from Comments, no edit/delete
- **Live time tracking** — start/stop timer in the Hours Log section as an alternative to manual entry; one running timer per ticket

### Clients
- Business and residential client directory with add, edit, delete, and search
- Business model: a company is a group of client records sharing the same company name; the primary record (lowest ID) holds company-level info; additional records are contacts
- New Ticket modal picks company first, then contact within that company

### Invoices
- Create invoices manually or directly from a ticket
- Line items, tax presets, status tracking (Draft / Sent / Paid / Void)
- PDF generation per invoice

### Client Portal
- Per-client portal at `/p/<slug>` — clients log in to view their tickets and invoices
- **Online payments** — Pay Now button creates a Stripe Checkout session for the invoice balance; a webhook auto-records the payment and marks the invoice Paid on success (optional — requires `STRIPE_*` env vars; safely disabled if unset)
- Business clients: all contacts in the company share one portal (same slug); each contact sees all company tickets but new tickets are attributed to the submitter
- Portal users are managed per-client from the Portal admin page (admin only)
- Forced password change on first login or after admin reset
- Auto logout after 30 minutes of inactivity

### Document Library
- Upload and manage documents (PDF, Word, Excel, PowerPoint, images, text; 20 MB max)
- Organised into 9 service categories:
  - Assessment & Diagnostic Services
  - Setup & Implementation Services
  - Migration Services
  - Recurring / Retainer Services
  - On-Demand Support & Advisory
  - Specialized / Infrastructure Services
  - Policy / Fee Documents
  - Client-Facing Summary
- **Documents Clients Need to Sign / Approve** — cross-cut section that surfaces any document with "Requires client signature" checked, regardless of its primary category
- Bulk upload with per-file metadata; bulk edit for selected documents
- Filter by ticket type; search by name or tag
- Ticket editor surfaces matched documents as a Playbook section

### Dashboard
- Stat cards: total, active, resolved, urgent, SLA breached, SLA at risk
- Priority and status charts
- My Active Tickets, SLA at Risk, Recent Open sections
- All cards and sections are clickable and navigate to a filtered ticket list

### Reports (admin only)
- Revenue by month and client
- Technician performance: tickets resolved, hours logged, labour revenue
- SLA compliance % by priority
- AR aging — outstanding receivables bucketed 30/60/90 days overdue, as of a chosen date
- All reports have CSV export; revenue/technician/SLA also support date-range filters

### Notifications
- Bell icon in the topbar with unread badge (polls every 30s); dropdown of recent notifications, click to jump to the ticket and mark read
- Fires on: ticket assignment, reassignment (independent of status change), status change, and internal comments on tickets assigned to you
- Read notifications older than 90 days are purged automatically; unread notifications are never purged

### Users
- Admin user management (create, edit, deactivate)
- Role-based access: admin and technician
- Self-service password change; minimum 8-character passwords enforced

### Security
- JWT authentication with refresh token rotation; 30/min rate limit on refresh endpoints
- Staff and portal tokens are isolated — portal tokens are rejected by all staff endpoints
- Rate limiting on all login endpoints (10/min)
- Idle session timeout: 30 minutes on both staff app and client portal
- Slug format validated server-side; CORS locked to required methods and headers
- Ticket CSV export restricted to admin role
- All queries use SQLAlchemy ORM (no raw SQL)

### Setup Wizard
- First-boot admin account creation
- Setup endpoint locked permanently after first use
