# Passport integration — planning reference

Passport is a new central authentication app for the ATech Solutions suite (Dispatch, Pulse,
Tether, Folio, Forge, Passvault, Scout), currently in planning. Full plan lives in the sibling
`passport/` repo: `passport/PLAN.md` (architecture, decisions, per-app rollout order) and
`passport/research/2026-07-14-suite-auth-audit.md` (the audit this plan is based on).

This file is a local pointer + Dispatch-specific notes. Nothing here is being built yet —
planning only, no code changes to this app as of 2026-07-14.

## Where this started

The Dispatch Suite Switcher (v1.50.0/v1.50.1 — `SuiteSwitcher.jsx`, `SUITE_*_URL` env vars,
`GET /api/config`'s `suite_apps` field) is what prompted this whole project: clicking a sibling
app from Dispatch's topbar just opens that app's own separate login today. The user asked how
to get real single sign-on across the suite, which led to this plan.

## Why Dispatch is a good early integration, not just the app that started this

Dispatch already has the most complete auth of any of the 7 apps surveyed — rotated, DB-backed
refresh tokens (`RefreshToken` model, `backend/app/models/models.py`) and working opt-in TOTP
(`FEATURE_2FA`, default disabled). Cutting Dispatch over to Passport is a genuine "does this
work for the most sophisticated existing case, not just the simplest one" test, done right after
Scout proves the basic pattern.

## What changes here when this ships

- `backend/app/security.py`'s local JWT issuing/verification gets replaced by verifying
  Passport-issued (asymmetrically-signed) access tokens, and local refresh-token issuance
  (`RefreshToken` model, currently HS256-signed and DB-backed) is replaced by calling Passport's
  token endpoint — Dispatch's own refresh-token table likely becomes unnecessary once Passport
  owns that responsibility, though the migration approach (main plan) says keep local
  credential columns present-but-unused for one release rather than dropping immediately.
- `LoginPage.jsx` and the Client Portal's separate login (`type: "portal"` JWT — a *different*
  concern, see below) both need review: staff login becomes a Passport redirect; the portal is
  explicitly out of scope (see Explicitly Out of Scope in the main plan) since portal users are
  external clients, not suite staff.
- `FEATURE_2FA`'s local TOTP enrollment/verification moves to Passport — 2FA becomes suite-wide,
  not a per-app toggle. Whatever Dispatch's `FEATURE_2FA` currently gates in the login flow will
  need to be re-thought once MFA lives centrally.
- `SuiteSwitcher.jsx` is the natural place to upgrade once Passport exists — instead of a plain
  bookmark list, a configured app the user already has an active Passport session for could open
  already-authenticated (one click, no separate login screen), while apps not yet integrated (or
  during the rollout period, apps not yet cut over) keep today's plain-link behavior. Not
  required for Passport v1, but worth keeping `SuiteSwitcher.jsx`'s shape in mind so this upgrade
  is additive later, not a rewrite.
- No `Tenant`/`Org` concept exists in Dispatch today (single-org by design) — nothing to
  reconcile with Passport's central org model beyond linking Dispatch's existing `User` rows to
  Passport identities by email.

## Suggested rollout position

Per the main plan's app-by-app order: **3rd**, right after Passport itself and Scout — proves
the pattern holds for the most feature-complete existing auth implementation before moving on to
apps with real complications (Tether's CORS gap, Passvault's zero-knowledge constraint).

## Explicitly not in scope here

The Client Portal (`src/PortalPage.jsx`, `portal.html`, `type: "portal"` JWTs, separate
`ClientPortalUser`/`PortalRefreshToken` models) is a different authentication surface entirely —
external clients logging in to see their own tickets/invoices, not ATech staff. Passport is for
suite-internal staff SSO; the Client Portal's auth is untouched by this project.
