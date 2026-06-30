# Changelog

## [1.4.0] — 2026-06-30

### Added
- **Browser history / URL routing** — installed `react-router-dom`; each page now has its own URL path (`/`, `/tickets`, `/tickets/:id`, `/clients`, `/invoices`, `/recurring`, `/documents`, `/reports`, `/settings`); browser back/forward buttons work correctly, deep links load the right page on refresh, and navigating to a ticket URL directly fetches and displays that ticket
- `TicketEditorRoute` — new component that reads the ticket ID from the URL, fetches the ticket on mount, and renders `TicketEditor`; used in both classic and new UI shells
- `BrowserRouter` added in `main.jsx`; nginx `try_files` already covered SPA fallback so no nginx change needed

## [1.3.4] — 2026-06-30

### Fixed
- React error #310 (invalid hook call) crashing the ticket playbook section: `useState(false)` for `allDocsOpen` was declared after two early `return null` guards inside `PlaybookSection`, violating the rules of hooks; moved it to the top of the component with the other state declarations

## [1.3.3] — 2026-06-30

### Added
- **On Hold status** — new ticket status that pauses the SLA clock; changing status to "On Hold" triggers a justification modal requiring a reason before confirming; the justification is automatically posted as an internal comment prefixed with ⏸
- SLA panel shows "⏸ Paused — On Hold" badge (same yellow style as Awaiting Client) when ticket is on hold
- Migration `0013_on_hold_status` — adds "On Hold" to the `ticketstatus` PostgreSQL enum

## [1.3.2] — 2026-06-30

### Added
- **SLA pause on Awaiting Client** — when a ticket status is set to "Awaiting Client", both SLA clocks (Response and Resolution) are paused; when status changes back to any active status, the elapsed wait time is added to both deadlines so the technician isn't penalised for client delays
- SLA panel shows a yellow "⏸ Paused — Awaiting Client" badge and "Paused since..." timestamp while paused
- `sla_paused_at` column added to tickets table (migration `0012_sla_paused_at`)
- `sla_paused_at` exposed in `TicketOut` schema and frontend editor state

## [1.3.1] — 2026-06-30

### Changed
- Playbook & Documents section now splits documents into **Suggested** (documents with tags — expanded by default) and **All Documents** (untagged — collapsed by default); "All Documents" can be toggled open with a ▼ button

## [1.3.0] — 2026-06-30

### Added
- **Case document tracking** — in the ticket Playbook & Documents section, each document now has a checkbox to attach it to the case; attached documents show "Acknowledged" and (if requires_signature) "Signature obtained" checkboxes; a green "Case Documents" summary panel at the top of the section lists all attached docs with their status
- `ticket_documents` table — stores which documents are attached to each ticket, with `acknowledged` and `signature_obtained` flags and who noted them
- `GET/POST /api/tickets/{id}/documents` — list and attach documents to a ticket
- `PATCH /api/tickets/{id}/documents/{doc_id}` — update acknowledged/signature_obtained flags
- `DELETE /api/tickets/{id}/documents/{doc_id}` — detach a document from a ticket
- Alembic migration `0011_ticket_documents`

## [1.2.0] — 2026-06-30

### Added
- **Ticket autosave** — existing tickets save automatically 3 seconds after any change; a subtle "Saving…" / "✓ Saved" indicator appears next to the Save button; new (unsaved) tickets are unaffected
- **SLA Response completes on In Progress** — when a ticket status is changed to In Progress, the Response SLA row shows "Responded" in green with a full green bar instead of a countdown; Resolution SLA continues ticking

## [1.1.0] — 2026-06-30

### Added
- **Bulk document edit** — checkbox per row in the Document Library; "Select All / Deselect All" and "Edit X Selected" buttons appear when any are checked; modal lets you set category, ticket types, tags, and requires-signature across all selected documents at once; fields left blank keep each document's existing value
- **Tag-first document ordering in ticket playbook** — documents with tags now appear above untagged ones; within each group, ticket-type-specific documents appear before catch-all (no ticket type) documents

## [1.0.4] — 2026-06-30

### Fixed
- Bulk upload: removing a file with × while upload was in progress did not cancel it — the upload loop captured row state at start and couldn't see removals; fixed with a `rowsRef` that stays in sync with state so the loop checks live whether each row still exists before uploading it
- nginx `client_max_body_size` raised from 10 MB to 25 MB to match the backend 20 MB limit; `proxy_read_timeout` raised from 30s to 120s

## [1.0.3] — 2026-06-30

### Fixed
- Downloads silently doing nothing: `downloadWithAuth` uses the Axios client (baseURL `/api`) but URLs still had the `/api` prefix, resulting in double `/api/api/...` paths; removed `/api` prefix from `downloadUrl` in `documents.js`, `attachments.js`, and all three CSV URL builders in `reports.js`

## [1.0.2] — 2026-06-30

### Fixed
- All file downloads (document library, ticket attachments, report CSV exports) now send the JWT Authorization header; previously used bare `<a href>` links which the browser opens without headers, causing 401 errors
- Added `downloadWithAuth(url, filename)` helper to `src/api/client.js` — fetches via Axios as a blob and triggers a browser save; used in DocumentsPage, App.jsx (playbook + attachments), and ReportsPage

## [1.0.1] — 2026-06-29

### Fixed
- File uploads failing: Docker named volumes mount as root, blocking writes by the non-root container user; backend container now runs as root to ensure `/app/uploads` is always writable
- `entrypoint.sh` now pre-creates `/app/uploads/documents` on startup so the directory exists before the first upload

## [Unreleased]

### Added
- **Reports page** — admin-only top-level nav item in both classic and new UI with three report tabs:
  - **Revenue** — total billed and paid per month, breakdown by client, outstanding balance; summary stat cards
  - **Technician** — tickets resolved, total hours logged, and total labour revenue per technician over a date range
  - **SLA Compliance** — % tickets resolved within SLA per priority (Urgent / High / Medium / Low); visual bar for each row; overall compliance score
- All three reports accept optional `date_from` / `date_to` filter and expose a CSV download
- `GET /api/reports/revenue` — revenue report JSON
- `GET /api/reports/revenue/csv` — revenue report CSV download
- `GET /api/reports/technician` — technician performance JSON
- `GET /api/reports/technician/csv` — technician CSV download
- `GET /api/reports/sla` — SLA compliance JSON
- `GET /api/reports/sla/csv` — SLA CSV download
- All report endpoints are admin-only
- `src/api/reports.js` — API wrappers and CSV URL helpers
- 16 new backend tests (164 total)

- **Update available notification** — a dismissible banner appears at the top of the page when a newer version is released; polls every 10 minutes; shows current vs latest version and a "View release →" link; instructions to run `./upgrade.sh`
- `GET /api/version/check` — returns `{ current, latest, update_available, release_url, configured }`; fetches latest GitHub release server-side using `GITHUB_TOKEN` (PAT); result cached 10 minutes; auth required
- `VERSION` file at repo root — single source of truth for the running version (`1.0.0`)
- `.env.example` — added `GITHUB_REPO` and `GITHUB_TOKEN` optional vars
- 5 new backend tests (186 total)

- **Form Templates** — admin-built reusable forms with typed fields (short text, long text/textarea, date, checkbox); templates scoped to ticket types; built via a "Form Templates" tab on the Documents page
- **Ticket Forms section** — inside each ticket, matching form templates appear under a "Forms" section; fill fields per-ticket, save to DB, reopen/edit at any time, print as a branded PDF
- `GET/POST /api/form-templates` — list and create form templates (admin create/update/delete; all users read)
- `GET/PUT/DELETE /api/form-templates/{id}` — manage individual templates
- `GET/POST /api/tickets/{id}/form-instances` — list and create filled form instances per ticket
- `GET/PUT/DELETE /api/form-instances/{id}` — manage individual instances
- Alembic migration `0010_form_templates` — `form_templates` and `form_instances` tables
- 17 new backend tests (181 total)
- Fixed document upload bug: Axios default `Content-Type: application/json` header overrode the multipart boundary; interceptor now strips it when body is `FormData`
- Bulk drag-and-drop upload zone on the Documents page — drop multiple files at once, edit name/category/ticket types per file before uploading

- **Document Library** — admin-only Settings tab to upload, tag, and manage internal and client-facing documents (PDF, Word, Excel, images, etc.); filter by category and ticket type; download and delete from the library
- **Playbook & Documents section on tickets** — surfaces matched documents automatically based on ticket type; split into Internal / Client-Facing categories with per-document download links; `requires_signature` flag shown when applicable
- `GET /api/documents` — list documents with optional `?category=` and `?ticket_type=` filters
- `POST /api/documents` — upload document (multipart, 20 MB limit); admin only for delete/update
- `GET /api/documents/{id}` — get document metadata
- `PUT /api/documents/{id}` — update metadata (admin only)
- `GET /api/documents/{id}/download` — download file
- `DELETE /api/documents/{id}` — delete document and file (admin only)
- Alembic migration `0009_documents` — `documents` table
- 17 new backend tests (148 total)

- **Payment tracking** — record partial or full payments against any invoice (amount, method, date, note); payments panel embedded in invoice editor; running balance displayed; invoice auto-marked Paid when fully settled
- **Invoice PDF** — "⬇ PDF" button opens a print-ready branded HTML invoice in a new browser tab; also available directly from the invoice list
- **Invoice email** — "✉ Send" button on invoice editor opens a modal to send the invoice by email with an optional message; invoice auto-promoted from Draft → Sent on send
- **Client statement** — "Statement" button per client row; modal shows all non-void invoices with total billed, total paid, and outstanding balance
- `DELETE /api/invoices/payments/{id}` — remove a payment record
- `GET /api/invoices/{id}/payments` — list payments for an invoice
- `POST /api/invoices/{id}/payments` — record a payment
- `GET /api/invoices/{id}/pdf` — branded invoice HTML (browser print)
- `POST /api/invoices/{id}/send` — send invoice by email (SMTP optional)
- `GET /api/clients/{id}/statement` — client billing statement
- `InvoiceOut` now includes `amount_paid` and `balance` computed fields
- Alembic migration `0008_invoice_payments` — `invoice_payments` table
- 13 new backend tests (131 total)

- `upgrade.sh` — one-command production upgrade script (`sudo ./upgrade.sh`)
- **File attachments** — upload screenshots and documents to tickets (PDF, images, Office, ZIP); 10 MB limit; stored in a Docker volume (`uploads_data`); downloadable directly from the ticket editor
- **Recurring tickets** — Recurring page in the nav; create/edit/delete schedules with daily/weekly/monthly/quarterly intervals; background worker fires due tickets every 5 minutes; shows next run date and last created ticket ID
- Alembic migration `0007_attachments_recurring` — `ticket_attachments` and `recurring_tickets` tables
- `/api/tickets/{id}/attachments` — upload, list attachments
- `/api/attachments/{id}/download` — file download endpoint
- `/api/attachments/{id}` — delete attachment
- `/api/recurring` — full CRUD for recurring ticket schedules
- 19 new backend tests (118 total)

## [0.2.0] — 2026-06-24

### Added
- **Clients page** — top-level nav item; full add/edit/delete with search and expandable rows (extracted from Settings)
- **Invoices page** — top-level nav item; create/edit/delete invoices with line items, tax presets (QC/ON/BC/AB/none), client picker, status filter (Draft / Sent / Paid / Void)
- **Create invoice from ticket** — button in ticket editor pre-populates invoice with services, labour, and travel from the ticket
- **SLA tracking** — response and resolution deadlines computed server-side at ticket creation; recalculated if priority changes; countdown badge on ticket list rows; dual progress bar panel in ticket editor sidebar
- **Dashboard home page** — default view after login; 6 stat cards, priority chart, status chart, My Active Tickets section, SLA at Risk section, Recent Open Tickets section; auto-refreshes every 60 seconds
- **Clickable dashboard** — stat cards and section "View all →" buttons navigate to the ticket list with the appropriate filter pre-applied (active, urgent, SLA breached, SLA warning, open)
- **Ticket export** — "⬇ Export" button in ticket list toolbar; filter by status, priority, client name, date range; downloads CSV with ticket details and computed totals
- Alembic migrations `0003_add_clients`, `0004_add_invoices`, `0005_add_sla_columns`
- `/api/invoices` — full CRUD endpoint
- `/api/dashboard` — aggregated dashboard data endpoint
- `/api/tickets/export` — filtered CSV export endpoint

### Changed
- Clients management moved out of Settings into its own top-level nav page
- Settings page now contains only Users (admin) and Change Password tabs
- Default view on login changed from ticket list to dashboard
- Logo click navigates to dashboard home

### Fixed
- Invoice status stored as `String(20)` + `CheckConstraint` instead of PostgreSQL enum to avoid `DuplicateObject` migration errors

## [0.1.0] — 2026-06-24

### Added
- FastAPI backend with PostgreSQL via SQLAlchemy + Alembic migrations
- JWT authentication with in-memory token storage, refresh rotation, auto-logout on 401
- Tickets API: list (search + status filter + pagination), create, get, update, delete
- Users API: list, create, update, deactivate (admin only); self-service password change
- Clients API: list, create, update, delete
- First-run setup wizard (`/api/setup/status` + `/api/setup/complete`)
- Rate limiting on `/api/auth/login` (10 req/min per IP via slowapi)
- `SECRET_KEY` strength validation at startup
- Structured JSON logging
- Health endpoint with DB liveness check
- Hourly background task to purge expired refresh tokens
- Multi-stage Dockerfiles for frontend and backend (`test` + `production` targets)
- `docker-compose.yml` with postgres, backend, frontend services and health checks
- nginx reverse proxy with `/api/` → backend routing
- Backend test suite: 35 tests
- Frontend test suite: 36 tests

## [0.0.1] — 2026-06-23

### Added
- React 18 + Vite SPA with ticket list, ticket editor, services catalogue, hour logs, travel fee
- Business and residential service catalogues
- PDF/print export per ticket via browser print API
- XSS protection: all user values escaped in print template via `esc()`
- Docker + nginx single-container deployment
