# Changelog

## [1.5.15] — 2026-07-02

### Changed
- **Document categories expanded** — replaced the old two-value Internal / Client-Facing with 9 purpose-built categories matching the service model:
  - Assessment & Diagnostic Services
  - Setup & Implementation Services
  - Migration Services
  - Recurring / Retainer Services
  - On-Demand Support & Advisory
  - Specialized / Infrastructure Services
  - Policy / Fee Documents
  - Client-Facing Summary
  - Documents Clients Need to Sign / Approve (cross-cut view — any document with `requires_signature = true` appears here regardless of its primary category)
- **Migration 0017** — widens `documents.category` column from `String(20)` to `String(60)` and remaps existing `internal` records to `on_demand_support`.

## [1.5.14] — 2026-07-02

### Changed
- **Documents grouped by category** — the Document Library now displays documents in collapsible sections (Internal / Client-Facing) instead of a flat table. Each section header shows the document count and can be collapsed independently. The category filter dropdown is removed since categories are now always visible as separate groups. Search and ticket-type filter still apply across all groups.

## [1.5.13] — 2026-07-02

### Changed
- **SLA deadlines skip weekends for non-Urgent priorities** — High, Medium, and Low SLA clocks now advance through business time only (Mon–Fri), skipping Saturday and Sunday. Urgent tickets continue to use wall-clock time so they are never delayed. A ticket created Friday at 22:00 with High priority (4h response) will be due Monday at 02:00 instead of Saturday at 02:00.

## [1.5.12] — 2026-07-02

### Security
- **Portal idle timeout** — client portal now auto-logs out after 30 minutes of inactivity (no mouse, keyboard, pointer, or scroll events). Matches the existing idle timeout already in place on the staff app. The timer resets on any user activity and triggers a clean logout (tokens cleared, refresh token revoked on the server).

## [1.5.11] — 2026-06-30

### Security
- **Slug validation now Pydantic-native** — `validate_slug` converted from a manually-called `@classmethod` to a proper Pydantic `@field_validator`. Slug format is now enforced automatically on deserialization for every code path, not only where the caller remembered to invoke it.
- **Refresh endpoints rate-limited** — both staff (`/api/auth/refresh`) and portal (`/portal/auth/refresh`) refresh endpoints now have a 30/min per-IP limit, closing the unlimited token-refresh attack surface.
- **Ticket export restricted to admin** — `GET /api/tickets/export` (full CSV dump of all tickets and client data) now requires `require_admin`. Previously any authenticated staff user could download the entire dataset.

## [1.5.10] — 2026-06-30

### Security
- **Staff password validation** — `UserCreateIn` and `UserUpdateIn` now enforce `min_length=8, max_length=128` and `min_length=1` on name, matching the constraints already in place for portal users. Previously a 1-character password could be set via API even if the frontend enforced length.
- **CORS tightened** — replaced `allow_methods=["*"]` and `allow_headers=["*"]` with explicit allowlists (`GET, POST, PUT, PATCH, DELETE, OPTIONS` and `Authorization, Content-Type`).
- **Full security audit passed** — verified: JWT token type isolation (portal tokens rejected by staff endpoints and vice versa), all endpoints protected with `get_current_user` or `require_admin`, no SQL injection (100% SQLAlchemy ORM), XSS escaping on all print/PDF output, refresh token rotation, setup lock, rate limiting on both login endpoints. `npm audit` and `pip-audit` both clean.

## [1.5.9] — 2026-06-30

### Fixed
- **Portal login failing for contact-linked users** — after the fix that stores portal users against their own contact record (not the primary), the login slug-scope check was still filtering by `client_id == primary.id` only. It now resolves all client IDs in the company group and uses `.in_()`, so any contact-linked portal user can log in via the company slug.
- **Cross-client session check broken for contacts** — `getClientBySlug` now returns `member_ids` (all client IDs in the company group). The frontend session validation checks `me.client_id` against the full `member_ids` list instead of just the primary record's id.

## [1.5.8] — 2026-06-30

### Fixed
- **Portal user linked to their own contact record** — when adding a portal user for a business contact, `client_id` is now set to the selected contact's id (not the primary/business record). This means tickets created by that user are attributed to them specifically, while the company-group scoping ensures all company users still see all tickets.
- **Portal ticket creation uses company primary for address/phone** — even when the portal user's `client_id` is a contact record, the ticket correctly pulls address and phone from the primary business record (lowest id in the company group).

## [1.5.7] — 2026-06-30

### Fixed
- **Portal ticket/invoice visibility** — tickets and invoices created against any contact in a business group are now visible in the portal. The portal user is scoped to the primary record (slug holder), but tickets can be filed against any member (contact) of the same company. The backend now resolves all client IDs sharing the same `company` name and filters by the full set, not just `pu.client_id`.
- **Portal ticket creation identifies the submitter** — tickets created from the portal now set `client_name` to "Company — Portal User Name" and `client_email` to the portal user's own email, so staff can see exactly who submitted the ticket rather than just the company name.
- **Invoice scoping** — same company-group fix applied to all three invoice endpoints (list, get, PDF).

## [1.5.6] — 2026-06-30

### Changed
- **New Ticket modal — two-step business client selection** — after picking a company, a Contact dropdown appears listing all contacts under that business. Selecting a contact sets `client_name` to "Company — Contact Name" and uses the contact's email/phone. If no contact is selected the ticket is assigned to the company directly. Residential clients work as before.

## [1.5.5] — 2026-06-30

### Fixed
- **New Ticket modal — client picker now matches business/residential model** — the picker previously showed all flat client records (including contacts under a business). It now deduplicates: each business company appears once (the primary record, lowest id in the company group), and residential clients appear individually. Selecting a business sets `client_name` to the company name and `client_type` to business automatically. The search matches on company name or email.

## [1.5.4] — 2026-06-30

### Added
- **Portal page** — dedicated top-level nav item (admin only) replacing the Settings tab; shows a client-first view where each client is an expandable card listing their portal users
- Each client card shows the portal URL (`/p/slug`), user count, and an inline slug editor — no need to go to the Clients page to set the slug
- Multiple portal users per client — each card has its own user table with add/edit/disable/delete; no limit on how many users a client can have
- "Show clients without portal" toggle — by default only clients with a slug or existing users are shown; checkbox reveals all clients to onboard new ones
- Portal tab removed from Settings page — all portal management is now on the dedicated Portal page

## [1.5.3] — 2026-06-30

### Security
- **Critical fix: cross-client session leak** — navigating from `/p/client-a` to `/p/client-b` while logged in as client-a showed client-b's data because the stored session was reused without checking ownership. `SlugPortal` now fetches both `portalMe()` and `getClientBySlug(slug)` in parallel on load and compares `me.client_id` against the slug's `client.id`; if they don't match the session is immediately cleared and the user is forced to log in to the correct portal.

## [1.5.2] — 2026-06-30

### Added
- **`frontend-portal` Docker service** — separate nginx container serving only the client portal; runs on `PORTAL_PORT` (default 8080); point your Cloudflare tunnel at this port
- `nginx.portal.conf` — portal-only nginx config: serves `portal.html` for `/p/*`, proxies only `/api/portal/` to the backend, returns 404 for all other `/api/*` routes so staff endpoints are unreachable from the portal instance
- `portal` build stage in `Dockerfile` — reuses the same Vite `dist/` as the staff app but copies `nginx.portal.conf` instead of `nginx.conf`
- `PORTAL_PORT` env var (default `8080`) controls which host port the portal service binds to
- `.env.example` updated with `PORTAL_PORT` and a comment explaining the Cloudflare setup

## [1.5.1] — 2026-06-30

### Changed
- Client portal URLs changed from `/portal` to `/p/:slug` — each client gets their own URL (e.g. `/p/acme-corp`)
- Portal login page shows the client's name fetched from the slug; wrong slug returns 404
- Login is scoped to the slug — a portal user can only authenticate against their own client's portal
- nginx `location /portal` changed to `location /p/` to serve `portal.html` for all client slugs
- `GET /api/portal/slug/:slug` — new public endpoint; returns client name for a slug so the login page can display it
- `POST /api/portal/auth/login` now accepts an optional `slug` field to scope login to a specific client
- `slug` field added to `Client` model — unique, optional, URL-safe (lowercase, hyphens); validated server-side with regex
- Alembic migration `0015_client_slug` — adds `slug` column + unique index to `clients` table
- Clients page — Portal Slug field on add/edit forms (auto-sanitises to lowercase + hyphens); Portal URL shown in expanded row view
- Settings → Client Portal tab — Portal URL column shows `/p/:slug` (or "no slug set" warning) for each account

## [1.5.0] — 2026-06-30

### Added
- **Client Portal** — a separate SPA at `/portal` where clients can log in and view their own tickets and invoices
- **Portal authentication** — dedicated JWT flow (`type: "portal"`) that is completely separate from staff tokens; portal tokens cannot access any staff endpoint; rate-limited login; refresh token rotation; auto-logout on expiry
- **Portal ticket list & detail** — clients see only tickets linked to their client record; read-only view showing status, priority, type, description, and SLA deadlines
- **Portal ticket submission** — clients can open new tickets via the portal; the ticket is created against their client record with the correct priority and SLA deadlines
- **Portal invoice list & detail** — clients see all non-void invoices with balance, payment history, and a PDF download button (authenticated, same print-ready HTML as the staff view)
- **Client Portal Accounts** — new "Client Portal" tab in Settings (admin only); create, edit, enable/disable, and delete portal login accounts; each account is linked to a client record
- `ClientPortalUser` and `PortalRefreshToken` models — separate tables from staff users; deleted automatically when a client is deleted
- Alembic migration `0014_client_portal` — `client_portal_users` and `portal_refresh_tokens` tables
- `POST /api/portal/auth/login` — portal login (rate-limited 10 req/min); issues `type: "portal"` JWT
- `POST /api/portal/auth/refresh` — portal token refresh with rotation
- `POST /api/portal/auth/logout` — revokes portal refresh tokens
- `GET /api/portal/auth/me` — returns current portal user
- `GET /api/portal/tickets` — list tickets scoped to the authenticated client
- `GET /api/portal/tickets/{id}` — ticket detail (enforces client ownership)
- `POST /api/portal/tickets` — submit a new ticket as a portal client
- `GET /api/portal/invoices` — list non-void invoices scoped to the authenticated client
- `GET /api/portal/invoices/{id}` — invoice detail with line items and payments
- `GET /api/portal/invoices/{id}/pdf` — authenticated invoice PDF for portal clients
- `GET /api/portal/accounts` — list portal accounts (admin only, optional `?client_id=` filter)
- `POST /api/portal/accounts` — create portal account (admin only)
- `PATCH /api/portal/accounts/{id}` — update name, email, password, or active status (admin only)
- `DELETE /api/portal/accounts/{id}` — delete portal account (admin only)
- `_build_invoice_html()` extracted from `invoice_pdf` route so it can be reused by the portal PDF endpoint
- `src/portal/` — new portal frontend directory with its own Axios client, API wrappers, and full React SPA
- `portal.html` — Vite multi-page entry point for the portal SPA
- Vite multi-page build configured in `vite.config.js` — both `index.html` and `portal.html` compiled to `dist/`
- nginx `location /portal` block — `try_files` to `portal.html` for client-side routing under `/portal`
- `src/api/portal.js` — admin API wrappers for portal account CRUD
- Expired portal refresh tokens purged by the existing hourly background task

## [1.4.2] — 2026-06-30

### Fixed
- Invoice PDF button did nothing: `invoicePdfUrl` had `/api/` prefix which doubled to `/api/api/` when passed through Axios (baseURL `/api`); removed prefix so URL is `/invoices/{id}/pdf`

## [1.4.1] — 2026-06-30

### Fixed
- Invoice PDF buttons returned 401: `window.open` opens a new tab without the JWT; replaced with `openPdfWithAuth` which fetches the HTML via Axios (with auth header) and writes it into a new window for printing
- Added `openPdfWithAuth(url)` helper to `src/api/client.js`

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
