# Changelog

## [1.17.0] — 2026-07-05

### Added — feature toggles for Phase 12/13 additions
- Six new `FEATURE_*` env vars let you turn off any of the audit log, live time tracking, AR aging report, in-app notifications, recurring/retainer invoicing, and scheduling/dispatch calendar features independently, without touching code. All default `true` — upgrading changes nothing until you explicitly set one to `false`.
- Disabling a feature returns `503` from its API endpoints (matching the existing Stripe/email-to-ticket "exists but refuses" pattern) and hides its nav item/tab/section in the UI, rather than leaving dead UI that errors on every click.
- `write_audit()` and `create_notification()` are now centrally gated — when `FEATURE_AUDIT_LOG`/`FEATURE_NOTIFICATIONS` is off, every caller across the app (tickets, invoices, comments, appointments, inbound email, and the recurring-ticket/recurring-invoice background loops) silently no-ops, rather than needing a check at each of the ~15 call sites.
- Disabling notifications or recurring invoicing also stops their background loops (notification purge, recurring-invoice generation) from starting — no wasted cycles polling for a disabled feature.
- New `GET /api/config` endpoint exposes the six toggles (no secrets) so the frontend can render its nav/tabs to match; fetched once at login alongside the user profile.
- The timer feature's historical-data safeguard (a running/completed timer's `hour_logs` row surviving a ticket's autosave) is preserved even when the timer feature is later disabled — old timer data is never at risk from a toggle flip.

### Tests
- New `backend/tests/test_config_toggles.py` (13 tests): `/config` endpoint shape and auth, each of the six features' endpoints returning 503 when disabled, `write_audit`/`create_notification` no-op verification via a real call site, and confirmation that unrelated features (e.g. the other three reports) are unaffected by a neighboring toggle.
- Extended `ReportsPage.test.jsx`/`InvoicesPage.test.jsx`: AR Aging / Recurring tabs disappear when their feature flag is off.

## [1.16.0] — 2026-07-05

### Added — scheduling/dispatch calendar
- New **Schedule** page (staff nav): a day/week calendar for assigning technicians to on-site appointments. Drag a ticket from the "Unscheduled Tickets" sidebar onto a time slot to create a one-hour appointment; drag an existing appointment block to a new slot/technician to reschedule; cancel from the appointment block directly. Built with plain HTML5 drag-and-drop (matching the existing ticket board view's pattern) — no new frontend dependency.
- **Appointments are independent of ticket assignment** — a ticket can have zero, one, or many scheduled appointments (e.g. an initial visit plus a follow-up), tracked in a new `Appointment` model rather than reusing `Ticket.assigned_to`.
- Scheduling/rescheduling/cancelling an appointment notifies the assigned technician and writes an entry to the ticket's existing Activity/audit log (`appointment_scheduled` / `appointment_rescheduled` / `appointment_cancelled`) — no new UI needed for that, it surfaces through the audit trail already built in a previous release.
- **Known v1 limitations, deliberately deferred**: no double-booking validation (two overlapping appointments for the same technician are both allowed) and no technician availability/working-hours/PTO modeling.
- New table `appointments` (migration `0027`), new `/api/appointments` CRUD endpoints, and a new `has_appointment` filter on `GET /api/tickets` (used to populate the "Unscheduled Tickets" sidebar without a separate endpoint).

### Tests
- New `backend/tests/test_appointments.py` (9 tests): CRUD, range-query filtering, technician notification on create, audit log entries for create/reschedule/cancel with correct old/new values, validation (end before start, missing ticket).
- Extended `backend/tests/test_tickets.py`: `has_appointment` filter correctly separates scheduled from unscheduled tickets.
- New `src/__tests__/SchedulePage.test.jsx`: renders the unscheduled sidebar; simulates a drag-and-drop onto a time slot and asserts the appointment is created with the correct ticket/technician.

## [1.15.0] — 2026-07-05

### Added — recurring/retainer invoicing
- New **Recurring** tab on the Invoices page (admin only): schedule an invoice to auto-generate on a daily/weekly/monthly/quarterly interval, for managed-services retainers. Each schedule has a full line-item template (same shape as a normal invoice's lines), reused verbatim (or with an optional `{month}` token interpolated, e.g. "Retainer — {month}" → "Retainer — July 2026") on every invoice it generates.
- **`auto_send` toggle** per schedule (default off): off generates the invoice as a Draft for review; on emails it to the client immediately, using the exact same send logic as the manual "Send Invoice" button (extracted into a shared `_send_invoice_email` helper so the template/status-flip logic lives in one place, not duplicated).
- Recurring invoice schedules are **admin-only** to create/edit/delete — stricter than the existing recurring-ticket schedules (any staff can create those), since this feature touches client billing and can auto-email clients unattended.
- Generated invoices are attributed to `System (recurring)` in the audit trail, same convention as recurring tickets.
- New tables `recurring_invoices`/`recurring_invoice_lines` (migration `0026`), new `/api/recurring-invoices` CRUD endpoints, and a new background loop (`recurring_invoice_loop`, every 5 minutes) alongside the existing recurring-ticket loop.

### Tests
- New `backend/tests/test_recurring_invoices.py` (12 tests): CRUD with admin-only enforcement on all five endpoints, `_fire_due_recurring_invoices()` invoked directly — creates invoice + lines, advances `next_run`, writes the audit row; `auto_send` off/on behavior (mocking `mail._send`, never a real SMTP call); `{month}` interpolation; regression test confirming manual "Send Invoice" still works after the shared-helper extraction.
- Extended `src/__tests__/InvoicesPage.test.jsx`: Recurring tab renders schedules from the API.

## [1.14.0] — 2026-07-04

### Added — email-to-ticket (inbound intake)
- Clients can now reply directly to any ticket notification email and have their reply threaded onto the same ticket — the inbound webhook matches the `[TKT-YYYY-NNNNN]` tag already present in every outbound notification's subject line. Emails with no matching tag (or a tag that no longer resolves to a real ticket) automatically create a brand-new ticket instead of erroring.
- Client-authored comments (from inbound email) render with a **Client** badge in the ticket's comment thread and can only be deleted by an admin, never by an arbitrary technician.
- New `POST /api/inbound-email/{secret}` webhook, compatible with Postmark's inbound-parse payload shape. Zero-auth by design (like the Stripe webhook) — a shared secret in the URL path is the sole gate, since Postmark's inbound webhooks don't support signature verification the way Stripe does. Wrong or missing secret returns 404 (not 401/403) so the endpoint's existence is never confirmable. Idempotent on webhook retries via the email's `Message-ID`.
- **Trust tradeoff, documented in code**: a reply is threaded onto its ticket regardless of whether the sender's address matches the ticket's `client_email` — CCed staff, forwarded threads, and client staff turnover are all legitimate reasons for a different address to reply, and rejecting risks silently dropping a real client reply. Since these comments are always non-internal and never touch billing/internal notes, the residual risk is client-visible-comment noise, not data exposure.
- Schema: `TicketComment.author_id` is now nullable (null = non-staff author), plus new `author_label` (display name/email) and `external_message_id` (webhook idempotency) columns. `Ticket.created_by` is also now nullable, for tickets auto-created from an unmatched inbound email. New `INBOUND_EMAIL_SECRET` env var (optional — leave blank to disable the feature, matching every other optional-integration pattern in this app). Migration `0025`.

### Tests
- New `backend/tests/test_inbound_email.py` (8 tests): secret gate, threading onto an existing ticket, new-ticket fallback (both "no tag" and "tag not found" cases), sender-mismatch-still-threads, webhook idempotency, malformed-payload 400.
- Extended `backend/tests/test_comments.py`: outer-join regression (client-authored comments appear in the list), non-admin cannot delete a client-authored comment, admin can.

## [1.13.0] — 2026-07-03

### Added — in-app notification center
- New **bell icon** in the topbar (staff app) shows an unread-count badge, polling every 30 seconds. Clicking it opens a dropdown of recent notifications; clicking a notification marks it read and navigates to the ticket. "Mark all read" clears the badge.
- Notifications fire on: being assigned a ticket (on create), being **reassigned** to a ticket (independent of whether its status also changed — this closes a real gap in the existing email notifications, which only ever fire on status change), a status change on a ticket assigned to you, and an internal comment posted on a ticket assigned to you by someone else (you're never notified of your own comments). This is intentionally simpler than @mention parsing — no `@name` syntax, just "internal comment on your ticket" — full mention parsing is deferred.
- In-app notifications are a separate system from email notifications, not a replacement — the two now have independent, appropriately different noise thresholds.
- **Retention**: a new hourly background task purges read notifications older than 90 days (unread notifications are never purged, regardless of age), mirroring the existing refresh-token purge loop.
- New table `notifications` (migration `0024`), new endpoints `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`.

### Tests
- New `backend/tests/test_notifications.py` (10 tests): assignment/reassignment/status-change/comment triggers, self-notification guard, per-user scoping, mark-read ownership check, mark-all-read, unread-count, purge-deletes-old-read-only.
- New `src/__tests__/NotificationBell.test.jsx` — badge count, dropdown rendering, click-marks-read-and-navigates.

## [1.12.0] — 2026-07-03

### Added — online payments via Stripe
- The portal's **Pay Now** button (shipped as a placeholder in v1.8.1) now creates a real Stripe Checkout Session and redirects the client to Stripe's hosted payment page for the invoice's outstanding balance. On success, a Stripe webhook records the payment automatically and the invoice auto-marks Paid (reusing the same auto-mark-paid rule as manual payments), which in turn closes its linked tickets exactly as a manual full payment does.
- **New `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` env vars** (all optional — leave blank and the feature no-ops with a "coming soon" message, same as before). New `PORTAL_URL` env var for building the Stripe redirect URLs.
- `nginx.portal.conf` gained a new `/api/payments/webhook` location block, since Stripe's webhook has to reach the app from the public internet and the portal's nginx is the only internet-facing one in this deployment (the staff app intentionally stays off the public network). Picked up automatically by `./upgrade.sh` (rebuilds the image from source) — no manual server config edit needed.
- `InvoicePayment.recorded_by` is now nullable — Stripe-recorded payments have no human recorder (`method="stripe"`, `recorded_by=NULL`). Any code displaying "recorded by" must handle null (shown as "Stripe" going forward).
- New `stripe_payment_intent_id` (unique) on `invoice_payments` for webhook idempotency — Stripe retries webhook delivery, and a replayed event no longer double-records the payment. New `stripe_checkout_session_id` on `invoices` for reliable invoice lookup from the webhook. Migration `0023`.
- New backend endpoints: `POST /api/portal/invoices/{id}/checkout` (creates the Checkout Session, portal-tenant-scoped, re-validates payability server-side — never trusts the frontend gate as the authorization boundary) and `POST /api/payments/webhook` (Stripe signature-verified, the only unauthenticated endpoint in the app; refuses to accept anything if `STRIPE_WEBHOOK_SECRET` isn't configured, rather than accepting unverified payloads).
- Scope: full invoice balance only — no partial payments or fee pass-through via Stripe in this release.

### Tests
- New `backend/tests/test_payments.py` (8 tests): checkout session creation, cross-tenant rejection, already-paid rejection, missing-config 503, invalid webhook signature, successful webhook payment recording with null `recorded_by`, webhook idempotency on replay. Stripe's SDK is mocked throughout — no real Stripe calls.
- New `src/__tests__/PortalApp.test.jsx` — first component-level test for the portal SPA; verifies Pay Now creates a checkout session and redirects to Stripe.

## [1.11.0] — 2026-07-03

### Added — AR aging report
- New **AR Aging** tab on the Reports page (admin only): outstanding receivables bucketed into Current / 1-30 / 31-60 / 61-90 / 90+ days overdue, as of a chosen date (defaults to today). Shows bucket totals with counts, a grand total outstanding, and a detail table of every overdue invoice with days overdue and balance. CSV export included, matching the existing report pattern.
- Paid and Void invoices are excluded; invoices with a zero balance (fully covered by partial payments but not yet marked Paid) are also excluded to avoid noise.
- New endpoints `GET /api/reports/ar-aging` and `GET /api/reports/ar-aging/csv` in the existing `reports.py` router.

### Tests
- New AR aging tests in `backend/tests/test_reports.py`: bucket-boundary correctness at 30/31/60/61/90/91 days overdue, Paid/Void/zero-balance exclusion, admin-only gate, CSV smoke test.
- New `src/__tests__/ReportsPage.test.jsx` — first test coverage for the Reports page; covers the AR Aging tab rendering bucket and invoice data from the API.

## [1.10.0] — 2026-07-03

### Added — live time tracking
- Tickets now support a **start/stop timer** in the Hours Log section as an alternative to manual hour entry. Starting a timer creates a running `hour_logs` row; stopping it computes elapsed hours automatically. One running timer per ticket (not per technician) in this release.
- Timer-originated rows are shown read-only in a separate list from manually-entered rows, and both are summed into the ticket's total hours/price. A running timer contributes $0 to the total until stopped — you're not billed for a timer still ticking.
- **Fixed a latent bug this feature would otherwise have hit**: `PUT /tickets/{id}` used to unconditionally delete and recreate every `hour_logs` row for a ticket on every save (including autosave), driven entirely by the frontend's manual-entry payload. A timer running in the background — invisible to that payload — would have been silently deleted by the next autosave. The update endpoint now only replaces manually-entered rows (`started_at IS NULL`); timer rows are owned exclusively by the new timer endpoints.
- New endpoints: `POST /api/tickets/{id}/timer` (start), `POST /api/tickets/{id}/timer/stop`, `GET /api/tickets/{id}/timer/active`. New columns on `hour_logs`: `started_at`, `ended_at`, `is_running` (migration `0022`).

### Tests
- New `backend/tests/test_timer.py` (8 tests), including a regression test that starts a timer, then simulates a full ticket autosave, and asserts the running timer row survives untouched.

## [1.9.0] — 2026-07-03

### Added — immutable ticket audit log
- Every ticket now keeps an **Activity** trail: who created it, who changed its status, assignee, or any other tracked field, and who changed its price (via service lines, hour logs, or travel fee) — with old/new values and a timestamp. Visible to all authenticated staff at the bottom of the ticket editor, below Comments.
- The audit log is **write-once** — there is no update or delete endpoint for it, by design. It complements Comments rather than replacing them.
- Billing-driven ticket changes (e.g. marking an invoice Paid, which auto-closes its linked tickets) are attributed to the staff member who triggered the invoice action, not to an anonymous "System" actor. Recurring-ticket auto-creation is attributed to `System (recurring)` since no human is in the loop there.
- New table `audit_logs` (migration `0021`), new endpoint `GET /api/tickets/{id}/audit`, new shared `backend/app/audit.py` helper used by the tickets and invoices routers.

### Tests
- New `backend/tests/test_audit.py` (8 tests): created/status/assignee/price entries, assignee changes never also emit a generic field-changed entry, no write endpoints exist, technicians can view, 404 on missing ticket, 401/403 unauthenticated.
- Extended `backend/tests/test_invoices.py`: marking an invoice Paid attributes the resulting ticket status-change audit entry to the recording user.

## [1.8.1] — 2026-07-03

### Added — client portal "Pay Now" (Stripe-ready placeholder)
- Invoice detail pages in the client portal now show a **💲 Pay Now** button and a prominent **Balance Due** call-to-action whenever the invoice has an outstanding balance and isn't already Paid or Void. For now it shows a "coming soon — please contact us" message; the click handler is the single spot where Stripe Checkout will be wired in later (create a Checkout Session on the backend and redirect).
- Extracted the payability rule into `src/portal/helpers.js` (`isInvoicePayable`) with unit tests.

### Verified (already working, no change needed)
- Clients can see their invoices (list with status, total, paid, and balance), open any invoice, and download its PDF.
- Paid/unpaid state is clear from the status badge (Draft / Sent / Paid) plus the Paid and Balance Due amounts on both the list and detail views. Voided invoices are hidden from the portal entirely.

## [1.8.0] — 2026-07-02

### Added — invoices now have their own pages (like tickets)
- Each invoice is now a routed page with its own URL, matching how tickets work:
  - `/invoices` — the list
  - `/invoices/new` — create a new invoice
  - `/invoices/:invoiceId` — view/edit a specific invoice
- Clicking an invoice row (or **Edit**) navigates to that invoice's page; **+ New Invoice** goes to `/invoices/new`; saving or cancelling returns to the list. Invoice pages are now bookmarkable and browser back/forward works. "Create invoice from ticket" opens `/invoices/new` pre-filled.
- The editor now loads its own data by URL (fetches the invoice for `:invoiceId`), so the list component is list-only.

### Tests
- New `src/__tests__/InvoicesPage.test.jsx` — list renders rows, `/invoices/new` shows the create form without fetching, `/invoices/:id` fetches and renders the invoice.

## [1.7.2] — 2026-07-02

### Fixed / Hardened
- **A ticket can no longer be invoiced twice** — the picker already hid invoiced/paid tickets, but the attach endpoint didn't enforce it, so a stale picker, a second browser tab, or a direct API call could add an already-billed ticket to a second invoice and double-bill it. `POST /invoices/{id}/tickets` now rejects the request with **409 Conflict** (listing the offending ticket IDs) if any ticket is already `invoiced` or `paid` on another invoice. Validation happens up-front so the request is atomic — nothing is partially attached. Re-sending a ticket already on the *same* invoice remains a harmless no-op.
- Frontend surfaces the server's reason (e.g. "Already invoiced…") instead of a generic error, and refreshes the picker so the stale ticket disappears. During new-invoice creation, a ticket-attach failure no longer reports the whole invoice save as failed — the invoice still completes and only the ticket issue is shown.

### Tests
- Added coverage: attaching an already-invoiced ticket to a second invoice → 409; attaching a paid ticket again → 409; re-attaching to the same invoice is a no-op (no duplicate lines).

## [1.7.1] — 2026-07-02

### Changed — invoicing workflow tied to ticket status
- **Only Resolved tickets can be invoiced** — the invoice ticket picker (both during creation and when editing an invoice) now lists only tickets whose workflow status is *Resolved*. Open / In Progress / Awaiting Client / On Hold tickets are no longer offered for billing.
- **Invoice paid → ticket Closed** — when an invoice is marked Paid (via status change, auto-pay on full payment, or the "Mark All Tickets Paid" button), its linked tickets are now set to workflow status **Closed** in addition to billing status **Paid**. Paid work is fully done.
- Picker labels updated to say "Resolved Tickets" / "No resolved, unbilled tickets for this client" so it's clear why non-resolved tickets don't appear.

Full lifecycle: a ticket is worked to **Resolved** → appears in the invoice picker → added to an invoice becomes **Invoiced** → invoice paid becomes **Paid + Closed**. Removing it from an invoice (or deleting the invoice) returns it to **Unbilled**.

### Tests
- Added coverage: picker excludes non-Resolved tickets; marking an invoice paid closes its tickets; bulk mark-paid closes tickets.

## [1.7.0] — 2026-07-02

### Fixed
- **Tickets stuck showing "invoiced"/"paid" after their invoice was deleted** — deleting an invoice removed the ticket↔invoice join rows (CASCADE) but never reset the ticket's `billing_status`, so tickets displayed as invoiced/paid with no invoice behind them. `delete_invoice` now reverts each affected ticket to `unbilled` (unless it's still linked to another invoice). Migration 0020 reconciles existing data by re-deriving every ticket's billing status from its real invoice links (no link → unbilled, linked → invoiced, on a Paid invoice → paid).

### Added
- **Billing status on the board (kanban) view** — ticket cards now show a "🧾 Invoiced" (blue) or "💲 Paid" (green) chip, matching the list view and ticket editor. Unbilled tickets show no chip.

### Behaviour (already correct, now consistent everywhere)
- A ticket becomes **Invoiced** when added to an invoice, and **Paid** when that invoice is marked Paid (or its tickets are bulk-marked paid). Removing a ticket from an invoice, or deleting the invoice, returns it to **Unbilled**.

### Tests
- Added coverage for invoice deletion reverting ticket billing status (both invoiced and paid cases).

## [1.6.9] — 2026-07-02

### Fixed
- **New-invoice ticket picker showed no unbilled tickets** — the `GET /invoices/unbilled-tickets` route (used while *creating* an invoice, before it has an ID) was registered *after* the dynamic `GET /invoices/{invoice_id}` route, so FastAPI matched the request as `invoice_id="unbilled-tickets"` and returned 404 "Invoice not found". The picker silently rendered "No unbilled tickets for this client." Moved the static route ahead of the dynamic one so it resolves correctly, and added a comment warning against reintroducing the ordering. (The edit-existing-invoice picker at `/invoices/{id}/unbilled-tickets` was never affected.)

### Tests
- Added direct coverage for `GET /invoices/unbilled-tickets` (by `client_id`, company-wide scope, and by `client_name`) — the endpoint previously had no tests, which is how the route-shadowing bug went unnoticed.

## [1.6.8] — 2026-07-02

Hardened the client-deletion foreign keys at the database level (previously only worked around in application code).

### Changed
- **`tickets.client_id` and `recurring_tickets.client_id` now use `ON DELETE SET NULL`** at the database level, matching the model definitions. Deleting a client now nulls these references automatically instead of relying solely on application code — the database enforces it directly (Alembic migration 0019). The models were updated to declare the same `ondelete` rule so `create_all` and the migrations stay in sync. The explicit nulling added in 1.6.6 is retained as defense-in-depth (covers the window before the migration runs).

### Tests
- Added `test_fk_constraints.py` — spins up an isolated SQLite engine with foreign-key enforcement **on** (the shared test DB has it off) and asserts, via a raw SQL delete that bypasses both the ORM and the application code, that deleting a client nulls the ticket/recurring-ticket references and preserves the denormalised client-name snapshot.

## [1.6.7] — 2026-07-02

Full bug sweep across the backend routers and frontend. Fixed three issues; verified auth, portal tenant-isolation, file uploads, reports, and money math are sound.

### Fixed
- **CSV ticket export crashed for month-end `date_to`** — the export built its exclusive upper bound with `date_to.day + 1`, which throws `ValueError` (and returns a 500) whenever `date_to` is the last day of a month (e.g. June 30 → "day 31"). It now advances the bound with a `timedelta`, so month and year roll over correctly.
- **Editing a user onto an existing email returned a 500** — `PUT /users/{id}` had no uniqueness check (only user *creation* did), so setting a duplicate email hit the DB unique constraint and surfaced as a server error. It now returns a clean 409 Conflict.
- **Admins could lock themselves out from the user edit form** — `PUT /users/{id}` now refuses to deactivate your own account or remove your own admin role (the delete endpoint already blocked self-deactivation; the edit path did not).

### Hardened
- Frontend `fmt()` money formatter now renders `$0.00` instead of `$NaN` when handed a missing/undefined value.

### Verified (no change needed)
- Portal endpoints enforce company-scoped tenant isolation on every ticket/invoice read.
- Attachment and document uploads store files under server-generated UUID names (no path traversal) with type/size limits.
- Recurring-ticket scheduling rolls over December → January correctly.
- Revenue/SLA report divisions are all guarded against divide-by-zero.

## [1.6.6] — 2026-07-02

Cross-domain integrity audit of the tickets ↔ clients ↔ invoices relationships. Verified all foreign keys, deletion behaviour, and billing-status sync; fixed three genuine issues found.

### Fixed
- **Deleting a client with a recurring ticket failed** — `recurring_tickets.client_id` has a foreign key but no ORM relationship on the Client model, so the reference was never nulled and PostgreSQL rejected the delete with a foreign-key violation (500 error). `delete_client` now explicitly nulls recurring-ticket references before deleting. (Regular tickets were already handled correctly — their `client_id` is nulled and the denormalised client-name snapshot is preserved.)
- **Removing a ticket from an invoice left its charges behind** — detaching a ticket used to keep the imported `[TKT-…]` line items on the invoice while reverting the ticket to *unbilled*, so the invoice total still charged for it and the ticket could be billed again on another invoice (double-billing risk). Detach now deletes the ticket's imported lines and recomputes the invoice totals.
- **Attaching a ticket to an already-paid invoice** now marks that ticket *paid* (matching the invoice) instead of *invoiced*.

### Verified (no change needed)
- Deleting a ticket that is linked to an invoice correctly removes the join row (invoice and its historical line items survive).
- Deleting a client with invoices nulls `invoices.client_id` (SET NULL) and keeps the client-name snapshot.
- New tickets always default to `unbilled`.

## [1.6.5] — 2026-07-02

### Added
- **Billing status visible on tickets** — ticket list cards and the ticket editor header now show an "Invoiced" (blue) or "Paid" (green) badge when a ticket has been billed. Tickets still at *unbilled* show nothing (no badge clutter for the common case).

### Changed
- **Invoice → ticket status sync** — marking an invoice as **Paid** (manually via the Status field, or automatically when recorded payments cover the total) now immediately sets all linked tickets to *paid*. Changing an invoice back to Draft or Sent resets non-paid tickets to *invoiced*. This keeps ticket billing status always in sync with the invoice without requiring a manual "Mark All Paid" step.

## [1.6.4] — 2026-07-02

### Fixed
- **Unbilled tickets not appearing** — tickets created before migration 0018 had `NULL` for `billing_status` instead of `"unbilled"` (the `server_default` only applies to new rows). Both unbilled-ticket endpoints now treat `NULL` the same as `"unbilled"`. Migration 0018 also backfills any remaining `NULL` values on upgrade.

### Added
- **Business name search on invoices** — the "Bill To" client picker is now a live search input instead of a plain dropdown. Type any part of a company or contact name to filter; click a result to select it. A "✕ Clear" link resets the selection back to manual entry.

## [1.6.3] — 2026-07-02

### Fixed
- **Invoice ticket picker — company-wide scope** — unbilled tickets are now fetched for the entire company, not just the one contact selected on the invoice. All contacts who share the same company name are included, so a monthly support invoice for "Acme Corp" shows tickets raised by any Acme contact.

### Added
- **Ticket picker during new invoice creation** — the "Attach Unbilled Tickets" picker now appears as soon as you select a client while creating a new invoice (previously it was only available after the invoice was saved). Selected tickets are attached automatically when you click "Create Invoice".

## [1.6.2] — 2026-07-02

### Changed
- **Sidebar UI is now the only UI** — the classic top-nav shell has been removed. `AppNew` (sidebar layout) is always rendered; the `newUI` localStorage toggle, the "✦ NEW UI" badge, and the "Classic UI" sidebar button are all gone. No behaviour or feature changes — purely structural cleanup.

## [1.6.1] — 2026-07-02

### Changed
- **Ticket editor — company + contact picker** — the "Client Information" section now shows two dropdowns instead of free-text fields when clients exist. The first dropdown lists all companies (one entry per company, not one per contact). Selecting a company reveals a second "Contact" dropdown showing only that company's contacts. Choosing a contact sets the ticket's `client_id` to that contact's record and fills Name / Phone / Email / Address below as a read-only summary. Switching the company clears the contact. Tickets without a linked client still fall back to the four editable text fields.

## [1.6.0] — 2026-07-02

### Added
- **Multi-ticket invoicing** — an invoice can now be linked to multiple tickets from the same client. A "Linked Tickets" panel appears on any existing invoice with a client assigned. From there you can:
  - Browse and checkbox-select all unbilled tickets for that specific client (other clients' tickets are never shown)
  - Click **+ Add Selected** to pull the selected tickets' service lines and hour logs in as invoice line items (automatically grouped with the ticket ID as prefix); invoice totals recalculate immediately
  - Remove a previously linked ticket from the invoice (its lines stay on the invoice but the ticket reverts to *unbilled*)
  - Click **✓ Mark All Tickets Paid** to bulk-set all linked tickets to *paid* billing status in one step
- **`billing_status` on tickets** — tickets now track `unbilled` (default) → `invoiced` (when added to a draft invoice) → `paid` (when the invoice is settled and you confirm). This lets you filter "what needs billing this month" from the tickets list.
- **`invoice_tickets` join table** — replaces the old single `ticket_id` column on invoices with a proper many-to-many relationship. Existing single-ticket links are migrated automatically (Alembic migration 0018).
- Invoice PDF and email now list all linked ticket IDs in the Invoice Details section.

## [1.5.18] — 2026-07-02

### Fixed
- **Adding contact while Edit Business was open created a new business** — the contacts section (including + Add Contact) is now hidden while the Edit Business form is open, so the two forms can never be active simultaneously. Clicking "Edit Business" also clears any open Add Contact form.
- **No way to delete a business** — a Delete button now appears in each company group header alongside "Edit Business". Deleting a business removes the primary record; contacts under that business should be deleted or reassigned separately.
- **Business count included contacts** — the "Business" section header count now shows the number of companies only, not companies + contacts.

## [1.5.17] — 2026-07-02

### Fixed
- **Version number visible in nav bar** — the running version (e.g. `v1.5.17`) now appears in the top-right of the staff nav bar. It is fetched from `/api/version/check` after login so it always reflects what is actually running on the server.
- **VERSION file missing inside Docker** — the backend Dockerfile previously built from the `./backend` context, which excluded the repo-root `VERSION` file. The build context is now the repo root (`.`) so `VERSION` is copied into `/app/VERSION` and the backend reads the correct version instead of "unknown".

## [1.5.16] — 2026-07-02

### Changed
- **Skeleton loading screens** — replaced plain "Loading…" text and spinners with animated shimmer skeletons on the four highest-visibility loading states: staff ticket list (card-shaped rows), ticket editor (field blocks), portal ticket table, and portal invoice table. The shimmer sweeps left-to-right at 1.4s to signal active loading.

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
