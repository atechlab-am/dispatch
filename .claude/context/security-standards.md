# Dispatch — Security Standards

> Non-negotiable. Every new feature and every code change must comply.
> If a change cannot meet a standard, flag it explicitly before implementing.

---

## Current State

Dispatch is a **full-stack app** (React SPA + FastAPI + PostgreSQL) with JWT auth, role-based access control, and a first-run setup wizard.

---

## 1. XSS Prevention

- Never interpolate user-supplied data into raw HTML strings without escaping
- `printTicket()` builds an HTML string for `window.open()` — **all ticket fields must be HTML-escaped** before insertion using `esc()`
- `esc(str)` encodes `<`, `>`, `"`, `&`, `'` — applied to every user value in the print template
- Never use `dangerouslySetInnerHTML` in React components unless the value is guaranteed static

## 2. PDF / Print Output

- `printTicket()` must escape all user-supplied values
- No `<script>` injection through ticket fields (client name, description, notes, etc.)
- URL-like fields (address, email) must not allow `javascript:` URIs

## 3. Token Storage

- Access tokens: **in-memory only** (`useState` in `client.js`) — never localStorage/sessionStorage
- Refresh tokens: in-memory on the client; stored as SHA-256 hash in DB (raw token sent once, never logged)
- Never log tokens or passwords to the console

## 4. Auth & API Security

- All non-public endpoints require a valid JWT (`get_current_user` dependency)
- Admin-only endpoints additionally require `require_admin` dependency
- Login: no user enumeration — same error message for wrong email and wrong password
- Missing resources return 404, not 403 (do not leak existence of records)
- Refresh tokens rotate on every use; old token invalidated immediately
- Setup endpoint (`/api/setup/*`) is locked after first admin created — returns 409 if called again

## 5. Input Handling

- All form fields are controlled React components (`value` + `onChange`)
- Numeric inputs (`qty`, `hours`, `rate`, `extraQty`) parsed and clamped before calculations; NaN and negative values handled gracefully
- Server-side validation via Pydantic v2 schemas — never trust frontend values
- Role must be one of the `UserRole` enum values; invalid roles return 422

## 6. Password Security

- Passwords hashed with bcrypt (passlib) — never stored plaintext
- Minimum password length enforced in frontend (8 chars) and should be enforced server-side too
- `change_own_password` verifies current password before accepting a new one

## 7. SECRET_KEY

- Must be at least 32 characters of high entropy
- App must refuse to start if `SECRET_KEY` is empty, the default placeholder, or shorter than 32 chars
- Generate with: `openssl rand -hex 32`

## 8. Rate Limiting (Phase 4)

- `/api/auth/login` must be rate-limited to prevent brute-force attacks (target: 10 req/min per IP via slowapi)

## 9. CORS

- CORS locked to explicit origins in `main.py` — never `*` in production
- Dev allows `localhost:3000` and `localhost:5173`

## 10. Dependency Hygiene

- `npm audit` must pass (no high/critical vulnerabilities) before shipping
- `pip-audit` clean before shipping
- Dependencies pinned to `^` minor ranges; lock files committed

---

## New Feature Checklist

Before shipping any new feature, verify:

- [ ] All user-supplied values escaped before insertion into HTML strings
- [ ] Numeric fields safely parsed, sane bounds
- [ ] No `dangerouslySetInnerHTML` with user data
- [ ] New endpoints protected with `get_current_user` or `require_admin`
- [ ] Pydantic schema validates all inputs
- [ ] `npm audit` passes
- [ ] Tests cover edge-case inputs

---

## Reference

| Concern | Location |
|---|---|
| Print/PDF template | `src/App.jsx` → `printTicket()` |
| XSS escape helper | `src/helpers.js` → `esc()` |
| Token storage | `src/api/client.js` |
| JWT encode/decode | `backend/app/security.py` |
| Password hashing | `backend/app/security.py` → `hash_password`, `verify_password` |
| Role enforcement | `backend/app/security.py` → `require_admin` |
| Input validation | `backend/app/schemas.py` |
| CORS config | `backend/app/main.py` |
| Setup lock | `backend/app/routers/setup.py` |
