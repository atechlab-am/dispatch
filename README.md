# Dispatch

Internal ticketing and client management system for ATechSolutions.

## Install (new machine, Docker)

Fresh-machine installer — checks for git/Docker, clones the repo, generates a real `.env` with random secrets, and starts the stack. Requires git and Docker (with the Compose v2 plugin) already installed.

**Don't use Docker?** See [Install (new machine, bare metal — no Docker)](#install-new-machine-bare-metal--no-docker) below instead.

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/atechlab-am/dispatch/main/scripts/linux/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/atechlab-am/dispatch/main/scripts/windows/install.ps1 | iex
```

Either script clones into `./dispatch` by default (override with `INSTALL_DIR=/path ./install.sh` or `-InstallDir` on Windows). If you've already cloned the repo yourself, just run `scripts/linux/install.sh` or `scripts\windows\install.ps1` from inside it instead — it detects the existing checkout and skips cloning.

Re-running install against an existing install is safe: it never overwrites an existing `.env`.

Open **http://localhost** — the setup wizard runs on first boot to create your admin account.

## Run (manual / local dev)

If you'd rather set things up by hand instead of using the installer above:

```bash
cp .env.demo .env
docker compose up -d --build
```

```bash
docker compose down      # stop (database preserved)
docker compose down -v   # stop + wipe database
```

`.env.demo` uses fixed, publicly-known placeholder secrets — fine for local evaluation, **not** for anything reachable outside your machine. Use the installer above (or copy `.env.example` and fill in your own `SECRET_KEY`/`POSTGRES_PASSWORD`) for a real deployment.

## Update (existing install)

**Linux / macOS:**
```bash
./scripts/linux/update.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\windows\update.ps1
```

Pulls latest code, rebuilds images without cache, restarts containers. Database migrations run automatically on startup. (`upgrade.sh` at the repo root does the same thing and still works — the `scripts/` versions are a separate, independent copy kept for discoverability alongside the install scripts.)

### Upgrading Postgres's major version

Neither `upgrade.sh` nor `scripts/*/update.*` change the Postgres version — they only rebuild images against whatever Postgres tag is already pinned in `docker-compose.yml`. A Postgres major-version bump (e.g. 16 → 18) needs its own procedure, since Postgres doesn't support starting a newer major version directly against an older version's on-disk data:

```bash
./upgrade-postgres.sh 18-alpine
```

This dumps the running database, stops the stack, renames (never deletes) the old data volume as a safety net, starts a fresh container on the target version, restores the dump, then brings the rest of the stack back up — printing an explicit rollback command at the end. Note: Postgres 18 also changed the image's expected volume-mount layout (`/var/lib/postgresql` instead of `/var/lib/postgresql/data`); the script detects and handles this automatically for 18+ targets.

**Run this before an app-code update, not after, and as its own separate step:**
1. Take an independent backup first if you have one configured (Settings → Backup → Backup Now) — this script's own safety net (a renamed local volume) isn't a substitute for an off-host backup.
2. Run `./upgrade-postgres.sh 18-alpine` on its own, from the repo root, with the stack already up (`docker compose ps` should show `postgres` healthy). This only changes the Postgres container/data — it doesn't touch app code and doesn't require a new release.
3. Confirm the app works normally against the new Postgres version (log in, browse a few pages, spot-check data you care about).
4. Once satisfied, remove the old backup volume using the command the script prints at the end.
5. From then on, run `upgrade.sh` / `scripts/*/update.*` as usual for ordinary app-code updates — they keep whatever Postgres version step 2 left in `docker-compose.yml` and never change it themselves.

Doing the Postgres jump and an app-code update in the same sitting makes it harder to tell which change caused a problem if something looks wrong afterward — verify the Postgres jump on its own first.

## Install (new machine, bare metal — no Docker)

For machines that don't run Docker at all. Installs and configures everything as native OS services instead of containers: Postgres (via the OS package manager / official installer), the FastAPI backend (Python venv + gunicorn, run as a service), and nginx serving the built frontend + reverse-proxying `/api` to the backend.

**Linux (Debian/Ubuntu via apt, or Fedora/RHEL/Rocky via dnf):**
```bash
./scripts/linux/install-bare-metal.sh
```
Run as a regular user with sudo access (not as root — the script calls `sudo` itself for the steps that need it). Installs prerequisites via the detected package manager, provisions a local Postgres database, sets up the backend in a Python venv running under a dedicated `dispatch` systemd service, builds the frontend, and configures two nginx server blocks (staff app on port 80, client portal on `PORTAL_PORT`/8080).

**Windows (PowerShell, elevated/"Run as Administrator"):**
```powershell
.\scripts\windows\install-bare-metal.ps1
```
Installs prerequisites via `winget` (Git, Python, Node.js, PostgreSQL), downloads nginx-for-Windows and NSSM directly (neither has a winget package), provisions the database, sets up the backend venv, and wraps both the backend and nginx as Windows Services via NSSM so they survive reboots without a login session. You'll be prompted for the PostgreSQL superuser password you set during the PostgreSQL installer's setup.

Both scripts are install-only (they don't overwrite an existing `.env`, and are safe to re-run against an already-installed system). There's no bare-metal `update` script yet — to update an existing bare-metal install: `git pull`, reinstall backend dependencies, re-run migrations, rebuild the frontend, then restart the backend and nginx services. See the comment at the top of each `install-bare-metal.*` script for the exact commands.

These are fully independent of the Docker-based scripts above — use one or the other, not both, for a given install.

## Stack

## Stack

React 18 + Vite · FastAPI · PostgreSQL · nginx · Docker

## Features

### Global Search
- Topbar search box (staff app) — type to search tickets, clients, invoices, and quotes at once; click a result to jump straight to it

### Tickets
- Create, edit, delete tickets with status, priority, client, and technician assignment
- **New Ticket modal** collects Description, Assigned Technician, and Work Location/Needs Scheduling up front (in addition to Type, Title, Client/Contact, Priority) — no need to open the full editor just to fill these in right after creating
- Search and filter by status, priority, assigned technician — defaults to an **Active** view (Open, In Progress, Awaiting Client), one click away from "All"
- **Services** — type-to-search the business/residential service catalogue to add a line (flat-fee, per-unit, or hourly pricing), same search-as-you-type UX as Materials
- PDF export per ticket; CSV bulk export (admin only)
- **SLA tracking** — response and resolution deadlines per priority:
  - Urgent: 1h / 4h (wall-clock, 24/7)
  - High: 4h / 8h · Medium: 8h / 24h · Low: 24h / 72h (business hours Mon–Fri, weekends skipped)
- Countdown badges on ticket list; dual progress bar in ticket editor
- SLA pauses automatically when status is set to Awaiting Client or On Hold; resumes and extends deadlines when work restarts
- **SLA-breach escalation** — a background check notifies the assignee (or all admins, if unassigned) once a ticket breaches its response or resolution deadline; never re-notifies for the same still-open breach
- Playbook section in ticket editor surfaces matched documents by ticket type
- **Activity/audit log** — immutable trail of who changed status, assignee, price, or other fields, and when; separate from Comments, no edit/delete
- **Live time tracking** — start/stop timer in the Hours Log section as an alternative to manual entry; one running timer per ticket
- **Email-to-ticket** — clients replying to a ticket notification email have their reply threaded onto the ticket automatically; unmatched inbound emails create a new ticket (optional — requires `INBOUND_EMAIL_SECRET`, safely disabled if unset)
- **Canned responses** — insert a reusable snippet into the comment box; the library is managed by admins from Settings
- **Materials Used** — log parts/materials consumed on a ticket alongside Hours Log: search the Materials catalog or type a new name, set quantity, get an autofilled editable unit price. Billing/reference only (no inventory tracking); rolls into the ticket total, PDF export, CSV export, and invoice conversion, same as service lines and hour logs
- **Work Location** (On-Site / Remote) and **Needs Scheduling** — two independent fields in the ticket editor's Scheduling section. Work Location is purely descriptive; Needs Scheduling controls whether the ticket appears in the Schedule tab's "Unscheduled Tickets" sidebar. Picking Remote on a brand-new ticket auto-defaults Needs Scheduling to No (a remote ticket usually doesn't need a technician dispatched), but this is only a one-time default at creation — editing Work Location on an existing ticket never silently changes an already-set Needs Scheduling value, since a remote ticket may still need a call booked

### Scheduling
- Day/week dispatch calendar — drag a ticket onto a technician's time slot to schedule an on-site appointment
- A ticket can have zero, one, or many appointments, independent of its assignee
- Scheduling/rescheduling/cancelling notifies the technician and logs to the ticket's Activity trail
- No double-booking validation or technician availability modeling yet (planned as a future refinement)
- **"Leads to Follow Up" sidebar** — leads with Follow-up scheduled checked (see Leads below) can also be dragged onto the calendar grid, creating a follow-up appointment in a distinct color from ticket appointments

### Leads (sales pipeline)
- Track sales prospects through a pipeline (New → Contacted → Qualified → Proposal → Won/Lost) before they become a Client — priority, source, outreach channel, contact/business info, notes, and a value estimate
- **Duplicate detection** — a debounced check while creating a lead warns if the business name, website, or phone matches an existing lead (including Lost ones), so you don't re-add a prospect that's already being tracked
- **Bulk actions** — select multiple leads to bulk-update priority/outreach channel/dates, or bulk-delete; bulk-moving to Lost isn't allowed since a lost reason has to be entered per lead
- **CSV import/export** — bulk-import from a spreadsheet with forgiving header names and common shorthand values, tolerant of Excel/Windows encodings; a downloadable sample CSV round-trips cleanly; export produces a full snapshot
- **Activity timeline** — a log of calls/emails/notes/meetings per lead, plus system-generated stage-change entries
- **Convert to Client** — a Won lead converts with one click into a real Client (business/contact info carried over), the same pattern as Quote → Invoice conversion below
- **Follow-up scheduled** — a checkbox next to Follow-Up Date; when checked, the lead shows up in the Schedule tab's "Leads to Follow Up" sidebar and can be dragged onto the calendar to book the follow-up call/meeting, alongside ticket appointments in a distinct color
- **Resizable columns** — drag a column header's right edge to widen/narrow it; the table scrolls horizontally (visible scrollbar) instead of squeezing every column to fit the screen
- Toggleable via `FEATURE_LEADS`

### Clients
- Business and residential client directory with add, edit, delete, and search
- Business model: a company is a group of client records sharing the same company name; the primary record (lowest ID) holds company-level info; additional records are contacts
- New Ticket modal picks company first, then contact within that company
- **Per-client SLA tiers** — optionally assign a business Gold/Silver/Bronze tier that tightens or relaxes its tickets' SLA deadlines relative to the global per-priority table (no tier = global default)
- Expanding a business shows a ticket/invoice summary (ticket count + open count, invoice count + total billed/outstanding) aggregated across every contact in the company
- **Portal Access** button on both business and residential clients deep-links straight to the Portal admin page, pre-filtered and expanded to that client, for provisioning portal access without leaving the Clients tab

### Invoices
- Create invoices manually or directly from a ticket
- Line items, tax presets, status tracking (Draft / Sent / Paid / Void) — list defaults to an **Active** view (Draft, Sent), one click away from "All"
- PDF generation per invoice — logo, company name/website, colors, and footer text are customizable (Settings → Quote/Invoice PDFs, admin only), applied to both the PDF and the emailed version
- **Recurring/retainer invoicing** — schedule an invoice to auto-generate on a daily/weekly/monthly/quarterly interval, with an optional auto-send toggle (admin only)

### Projects
- A **Project** is a top-level container wrapping one Quote → Ticket → Invoice chain — distinct from the Quotes list, which also includes quotes created without a project (creating a quote never requires a project)
- **+ New Project** prompts for a project name, then creates the project and a linked Draft quote in one step and takes you straight into the quote editor to fill in the client and line items
- The Projects list shows one row per project with its Quote/Ticket/Invoice status (once each stage exists) and a derived Stage badge, each linking straight through to the underlying record — status is always derived by following the linked quote's own `ticket_id`/`converted_invoice_id`, the same automatic Quote→Ticket→Invoice flow described below

### Quotes/Estimates
- Send a quote (Draft → Sent → Approved/Rejected/Expired) with the same line-item/tax/PDF/email shape as invoices — list defaults to an **Active** view (Draft, Sent), one click away from "All"
- One-click **Convert to Invoice** on an Approved quote — copies client, line items, and totals into a new Draft invoice
- Draft is the only editable state; Sent/Approved/Rejected/Expired are locked to preserve what the client actually saw
- **Materials catalog** — each quote line is tagged Labor, Material, or Service; Material lines search a reusable parts catalog (Settings → Materials, admin-managed) to autofill description and unit price, and round quantity up to the nearest whole unit. Materials have an optional **category** (free text with autocomplete) — the catalog is grouped/sorted by category, then name, then unit price; category is searchable in the catalog but not shown in the quote/invoice line-item autofill dropdown. **Bulk edit** — select multiple materials to set their category, adjust price (%, flat, or set), or delete, all in one action. Bulk-add entries via **Import CSV** (columns: `name`, `category`, `description`, `unit_price`) — validates every row before writing anything and reports per-row errors (e.g. missing name, invalid price) without blocking the valid rows
- **Service lines** — Service-type lines type-to-search the same business/residential service catalogue tickets use, filtered by the quote's client type; picking one autofills a starting price (flat-fee base price, or per-unit/hourly rate) into the line's qty/unit price, freely editable afterward
- **Quote → Ticket → Invoice workflow** — approving a quote automatically creates and links a Ticket, seeded with the quote's line items as hour-log entries (dollar-value preserved, no manual step). When that ticket is marked Resolved or Closed, the ticket editor prompts to convert the originating quote into an invoice.
- **Project Name** — optional free-text label (e.g. "Office Network Upgrade") shown in the quote list, PDF, and send-by-email view, and carried into the title of the auto-created ticket on approval

### Client Portal
- Per-client portal at `/p/<slug>` — clients log in to view their tickets and invoices
- **Online payments** — Pay Now button creates a Stripe Checkout session for the invoice balance; a webhook auto-records the payment and marks the invoice Paid on success (optional — requires `STRIPE_*` env vars; safely disabled if unset)
- Business clients: all contacts in the company share one portal (same slug); each contact sees all company tickets but new tickets are attributed to the submitter
- Portal users are managed per-client from the Portal admin page (admin only), reachable directly from a client's row on the Clients tab via a "Portal Access" link
- Staff are notified (in-app notification bell) when a client submits a new ticket via the portal, and when one of their invoices is paid in full
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
- **Quote → Ticket → Invoice funnel** — stage counts (quotes approved, tickets created, invoices converted) shown as a compact widget, with a **+ New Project** button that opens the Projects page to kick off the workflow
- Priority and status charts
- My Active Tickets, SLA at Risk, Recent Open sections
- **Leads section** (shown when `FEATURE_LEADS` is enabled) — stat cards (Total, Active, Won, Lost), a pipeline-by-stage chart (New → Contacted → Qualified → Proposal → Won/Lost), and a "Leads to Follow Up" list (leads with Follow-up scheduled checked, overdue ones sorted first) — all clicking through to the Leads page
- All cards and sections are clickable and navigate to a filtered ticket list

### Reports (admin only)
- Revenue by month and client
- Technician performance: tickets resolved, hours logged, labour revenue
- SLA compliance % by priority
- AR aging — outstanding receivables bucketed 30/60/90 days overdue, as of a chosen date
- Quote conversion — approval/ticket/invoice stage counts, conversion rates, average approval→ticket and ticket→invoice time, and $ value per stage
- All reports have CSV export; revenue/technician/SLA/quote conversion also support date-range filters

### Notifications
- Bell icon in the topbar with unread badge (polls every 30s); dropdown of recent notifications, click to jump to the ticket and mark read
- Fires on: ticket assignment, reassignment (independent of status change), status change, and internal comments on tickets assigned to you
- Read notifications older than 90 days are purged automatically; unread notifications are never purged

### Users
- Admin user management (create, edit, deactivate)
- Role-based access: admin and technician
- Self-service password change; minimum 8-character passwords enforced

### Appearance (admin only)
- Company-wide branding — company name, tagline, logo, favicon, primary/accent colors, sidebar dark/light style (New UI → Settings → ✦ Appearance)
- **Font colors** — Body Text, Muted Text, and Text on Buttons/Headers are all customizable and apply app-wide (every page), not just within the settings panel itself
- Saved server-side and shared by everyone who uses the app — not a per-browser or per-user setting
- Live preview while editing; Save persists it for everyone, Cancel reverts without saving
- **Login Page** and **Client Portal** each have their own separate appearance settings (Settings → Login Page / Client Portal) — company name, colors, font colors, and logo, independent from the staff app's Appearance settings and from each other. Both are readable without being logged in (a public endpoint returns only the cosmetic display fields) since both screens render before any session exists
- Both login screens use a clean, Microsoft-style centered card with an email-first sign-in flow (email, then password, then 2FA if enabled)
- **Quote/Invoice PDFs** have their own separate branding too (Settings → Quote/Invoice PDFs) — company name, website, logo, primary/accent colors, and a customizable footer line, applied to the quote/invoice PDF and the emailed version alike. Independent from the other three branding surfaces above; falls back to a styled text wordmark when no logo is set.
- **Font size controls** for the PDF header/logo, body text, table headers, and totals — adjustable via sliders.
- **Font color controls** — body text, muted/secondary text, and header text-on-color are all customizable, applied to both the PDF and the emailed version.
- **Custom HTML templates (advanced)** — full control over layout: replace the built-in invoice or quote PDF entirely with your own HTML using `{{placeholder}}` substitution (a full reference list is shown in the editor — `{{company_name}}`, `{{invoice_id}}`, `{{lines_html}}`, `{{total}}`, etc.). Invoice and quote templates are independent, each optional, and a broken template (unknown placeholder) is rejected at save time rather than ever breaking a real document — a **Preview** button renders against sample data before you save.

### Backups (admin only)
- Database + uploaded files backed up to a NAS share over SMB2/3 — pushed directly over the network from the backend container, no CIFS mount or elevated container privileges required
- Runs on a configurable schedule (`BACKUP_INTERVAL_HOURS`, default daily) plus an on-demand **Backup Now** button (Settings → Backup)
- Each backup is a single archive: a `pg_dump -Fc` database dump + a full copy of the uploads directory (ticket attachments, document library) + a manifest with timestamp/version/size
- Old backups on the NAS are pruned automatically beyond `BACKUP_RETENTION_COUNT` (default 14)
- **Restore** requires admin role and re-entering your password, shows the exact backup being restored (timestamp, size) before confirming, then briefly restarts the app while the database and uploads are replaced — this is destructive and cannot be undone
- `upgrade.sh` runs a best-effort backup automatically before every upgrade

### Security
- JWT authentication with refresh token rotation; 30/min rate limit on refresh endpoints
- Staff and portal tokens are isolated — portal tokens are rejected by all staff endpoints
- Rate limiting on all login endpoints (10/min)
- Idle session timeout: 30 minutes on both staff app and client portal
- Slug format validated server-side; CORS locked to required methods and headers
- Ticket CSV export restricted to admin role
- All queries use SQLAlchemy ORM (no raw SQL)
- **Two-factor authentication (2FA)** — optional TOTP-based 2FA per staff account (Settings → Security): QR-code enrollment, 10 one-time backup codes, password-confirmed disable. Off by default (`FEATURE_2FA=false`) — must be explicitly turned on

### Feature Toggles
Each feature below can be turned off independently via env vars. A disabled feature's API returns 503 and its nav item/tab/section disappears from the UI:
- `FEATURE_AUDIT_LOG` — ticket Activity/audit trail (default enabled)
- `FEATURE_TIMER` — live start/stop time tracking (default enabled)
- `FEATURE_AR_AGING` — the AR Aging report tab (default enabled)
- `FEATURE_NOTIFICATIONS` — the in-app notification bell, also stops its purge background loop (default enabled)
- `FEATURE_RECURRING_INVOICING` — the Recurring tab on Invoices, also stops its generation background loop (default enabled)
- `FEATURE_SCHEDULING` — the Schedule/dispatch calendar page (default enabled)
- `FEATURE_QUOTES` — the Quotes/Estimates page, convert-to-invoice action, auto-ticket-creation-on-approval, the Dashboard funnel widget, and the Quote Conversion report (default enabled)
- `FEATURE_GLOBAL_SEARCH` — the topbar global search box across tickets/clients/invoices/quotes (default enabled)
- `FEATURE_CANNED_RESPONSES` — the reusable canned-response picker in ticket comments (default enabled)
- `FEATURE_SLA_ESCALATION` — the background SLA-breach check and its notifications (default enabled)
- `FEATURE_SLA_TIERS` — per-client SLA tier overrides, gold/silver/bronze (default enabled)
- `FEATURE_MATERIALS` — the materials catalog (Settings tab + quote line-item autofill) (default enabled)
- `FEATURE_BACKUPS` — the scheduled/manual backup loop, the Settings → Backup tab, and the restore flow (default enabled; also requires `BACKUP_NAS_HOST`/`BACKUP_NAS_SHARE` to actually run — see `.env.example`)
- `FEATURE_LEADS` — the Leads sales-pipeline page, duplicate detection, bulk actions, CSV import/export, and Convert to Client (default enabled)
- `FEATURE_2FA` — two-factor auth enrollment and enforcement (**default DISABLED** — set to `true` to opt in; unlike every toggle above, this one changes the login flow itself)

### Setup Wizard
- First-boot admin account creation
- Setup endpoint locked permanently after first use
