# Passport integration — planning reference

Passport is a central authentication app for the ATech Solutions suite (Dispatch, Pulse, Tether,
Folio, Forge, Passvault, Scout), Phase 1 complete and standalone as of 2026-07-18. Full plan
lives in the sibling `passport/` repo: `passport/PLAN.md` (architecture, decisions, per-app
rollout order) and `passport/research/2026-07-14-suite-auth-audit.md` (the audit this plan is
based on).

This file is a local pointer + Dispatch-specific notes. Nothing here is being built yet in this
repo — planning only, no code changes to Dispatch as of 2026-07-20.

**Architecture note (2026-07-20): this is a domain-join model, not a migration.** Dispatch's own
local login, local `User` table, and local JWT issuance are permanent and never get replaced,
deprecated, or treated as a rollback path — they stay exactly as they are today, forever, with
or without Passport. Passport is an optional, additive identity a local Dispatch account can be
**linked** to (admin-initiated, not self-service), after which that account can authenticate via
either its local password or Passport SSO, independently. See `passport/PLAN.md`'s "Central
identity via domain-join, not migration" section for the full model — read it before assuming
anything below implies replacing existing auth code.

## Where this started

The Dispatch Suite Switcher (v1.50.0/v1.50.1 — `SuiteSwitcher.jsx`, `SUITE_*_URL` env vars,
`GET /api/config`'s `suite_apps` field) is what prompted this whole project: clicking a sibling
app from Dispatch's topbar just opens that app's own separate login today. The user asked how
to get real single sign-on across the suite, which led to this plan.

## Why Dispatch is a good early integration, not just the app that started this

Dispatch already has the most complete auth of any of the 7 apps surveyed — rotated, DB-backed
refresh tokens (`RefreshToken` model, `backend/app/models/models.py`) and working opt-in TOTP
(`FEATURE_2FA`, default disabled). Adding domain-join capability to Dispatch is a genuine "does
the join model layer cleanly onto the most sophisticated existing local auth, not just the
simplest one" test, done right after Scout proves the basic pattern.

## What gets added here when this ships (additive, not a replacement)

- **Nothing about `backend/app/security.py`'s local JWT issuing/verification, or the local
  `RefreshToken` model, changes or gets removed.** Dispatch's existing login continues to work
  exactly as it does today. What's added: a new `passport_links` table (local `User.id` ↔
  Passport `user_id`), a "Sign in with Passport" button alongside the existing login form, and a
  new admin screen for bulk-linking local accounts to Passport identities.
- A new "Passport Connection" settings screen (Servarr-style: enter Passport's URL, Test
  Connection, Enable) gates all of this — until an admin explicitly connects and enables it,
  none of the above is visible or reachable, and Dispatch makes zero calls to Passport. See
  PLAN.md's "The connection gate" section.
- `LoginPage.jsx` gains the Passport button; the Client Portal's separate login (`type:
  "portal"` JWT — a *different* concern, see below) is untouched and explicitly out of scope.
- `FEATURE_2FA`'s local TOTP stays exactly as it is — it's Dispatch's own local-account MFA, not
  something Passport takes over. A user signing in via Passport SSO instead goes through
  Passport's own MFA (if enabled on their Passport identity) as part of that separate flow; the
  two MFA systems are independent, not merged.
- `SuiteSwitcher.jsx` is the natural place to upgrade once domain-join exists — for a configured
  app the user's *currently active local session* happens to be linked to Passport for, and
  they already have an active Passport session, it could open already-authenticated (one click,
  no separate login screen); apps not connected, or accounts not linked, keep today's plain-link
  behavior. Not required for Passport v1, but worth keeping `SuiteSwitcher.jsx`'s shape in mind
  so this upgrade is additive later, not a rewrite.
- No `Tenant`/`Org` concept exists in Dispatch today (single-org by design) — nothing to
  reconcile with Passport's central org model; linking is purely local-`User`-row ↔
  Passport-identity by email, nothing org-shaped needed on Dispatch's side.

## Suggested rollout position

Per the main plan's app-by-app order: **3rd**, right after Passport itself and Scout — proves
the join model holds for the most feature-complete existing local auth implementation before
moving on to apps with real complications (Tether's CORS gap, Passvault's zero-knowledge
constraint).

## Explicitly not in scope here

The Client Portal (`src/PortalPage.jsx`, `portal.html`, `type: "portal"` JWTs, separate
`ClientPortalUser`/`PortalRefreshToken` models) is a different authentication surface entirely —
external clients logging in to see their own tickets/invoices, not ATech staff. Passport is for
suite-internal staff, optionally; the Client Portal's auth is untouched by this project.
