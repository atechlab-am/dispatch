# Getting started

This page picks up right after install — see the [README](../README.md) for the install
commands themselves (Docker or bare-metal).

## First boot

Open the staff app in your browser (`http://localhost` for a default Docker install, or
whatever host/port your bare-metal nginx config uses). Since no admin account exists yet, you
land on the **Setup Wizard** instead of the login page:

1. **Admin account** — your name, email, and password (minimum 8 characters). This becomes the
   first user, with the `admin` role.
2. **Branding** (optional, skippable) — company name, tagline, a color palette preset, and a
   logo upload. These populate the same fields Settings → ✦ Appearance edits later — nothing
   here is a one-time-only choice, all of it can be changed after setup.

The setup endpoint locks permanently the moment an admin account exists — reloading or
revisiting it afterward goes straight to the login page instead.

## Right after your first login

A few things worth doing before the app is handed to your team:

- **Settings → Users & Account** — create accounts for the rest of your team; decide who gets
  `admin` vs. the default technician role (admins get Reports, Backups, and every Settings tab;
  technicians don't).
- **Settings → ✦ Appearance** — if you skipped branding during setup, or want to revisit it:
  logo, colors, sidebar style. This is shared/server-side, seen by everyone.
- **Settings → Login Page** and **Settings → Client Portal** — separate, independent branding
  for those two screens (they render before any session exists, so they can't reuse the main
  app's branding fetch). See [Features → Appearance](features.md#appearance-admin-only) for the
  full breakdown of what's independent from what.
- **Feature toggles** — anything you don't need (Leads, Scheduling, 2FA, etc.) can be turned off
  via `.env` — see [Features → Feature Toggles](features.md#feature-toggles) for the full list
  and what each one gates.
- **Backups** — off until `BACKUP_NAS_HOST`/`BACKUP_NAS_SHARE` are set in `.env`. Worth
  configuring early — see [Features → Backups](features.md#backups-admin-only).

## Where to go from here

- [Features](features.md) — full feature-by-feature reference.
- [Operations](operations.md) — health checks, logs, and common failure modes once the app is
  running day-to-day.
- [README](../README.md) — install, update, backup/restore, and Postgres major-version upgrade
  procedures.
