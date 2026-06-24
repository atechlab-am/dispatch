# Dispatch — Security Standards

> Non-negotiable. Every new feature and every code change must comply.
> If a change cannot meet a standard, flag it explicitly before implementing.

---

## Current State
Dispatch is a **frontend-only SPA** with no auth, no backend, and session-only data storage. Security surface is minimal but still real — especially around XSS, PDF generation, and future backend integration.

---

## 1. XSS Prevention

- Never interpolate user-supplied data into raw HTML strings without escaping
- `printTicket()` builds an HTML string for `window.open()` — **all ticket fields must be HTML-escaped** before insertion
- Pattern: use a helper like `esc(str)` (encodes `<`, `>`, `"`, `&`, `'`) on every user value before injecting into the print template
- Never use `dangerouslySetInnerHTML` in React components unless the value is guaranteed static

## 2. PDF / Print Output

- `printTicket()` must escape all user-supplied values before they appear in the HTML string
- Do not allow `<script>` injection through ticket fields (client name, description, notes, etc.)
- Validate that any URL-like field (address, email) does not inject `javascript:` URIs

## 3. localStorage / sessionStorage (Phase 2+)

- Never store sensitive data (tokens, passwords) in `localStorage` without encryption
- JWTs (when added): store in memory (`useState`), not `localStorage` — or use `httpOnly` cookies from the backend
- Never log tokens or user credentials to the console

## 4. Input Handling

- All form fields are controlled components (`value` + `onChange`) — no raw DOM access
- Numeric inputs (`qty`, `hours`, `rate`, `extraQty`) must be parsed and clamped before use in calculations; `NaN` and negative values must be handled gracefully
- File imports (CSV, JSON — if added in future phases): validate content type and cap size before processing

## 5. Dependency Hygiene

- `npm audit` must pass (no high/critical vulnerabilities) before shipping
- Dependencies pinned to `^` minor ranges in `package.json`; lock file (`package-lock.json`) must be committed
- No unvetted third-party scripts injected at runtime

## 6. Phase 2 Backend Checklist (when added)

When a FastAPI/Express backend is introduced, apply all of the following before going live:

- [ ] JWT auth on all non-public endpoints
- [ ] CORS locked to explicit origins (no `*` in production)
- [ ] Rate limiting on login endpoint
- [ ] Input validated server-side via Pydantic/Zod (do not trust frontend values)
- [ ] Passwords bcrypt-hashed (never stored plaintext)
- [ ] No stack traces in production error responses
- [ ] HTTPS enforced via reverse proxy
- [ ] Audit log for state-changing operations

---

## New Feature Checklist

Before shipping any new UI feature, verify:

- [ ] All user-supplied values are escaped before insertion into HTML strings (especially `printTicket`)
- [ ] Numeric fields are safely parsed and have sane bounds
- [ ] No `dangerouslySetInnerHTML` with user data
- [ ] `npm audit` passes
- [ ] Test covers edge-case inputs (empty string, special chars, very large numbers)

---

## Reference

| Concern | Location |
|---|---|
| Print/PDF template | `src/App.jsx` → `printTicket()` |
| Numeric input handling | `src/App.jsx` → `ServiceRow`, `HourRow` |
| Brand tokens (no hardcoded colours) | `src/App.jsx` → `brand` constant |
