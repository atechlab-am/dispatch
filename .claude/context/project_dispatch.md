# Dispatch — Project Overview

## What is this
Internal ticketing system for ATechSolutions. Front-end-only React SPA — no backend, no auth. Technicians create and manage service tickets, log hours, and export client-facing PDFs. Part of the ATech Solutions suite alongside Tether (asset mgmt), Pulse (monitoring), and Nexus (docs). GitHub org: `atechlab-am`.

**Brand colours:**
- Blue: `#1A5CBA` (primary)
- Accent: `#E8A020` (amber)
- Background: `#F4F7FC`

**Tagline:** "Service tickets, done fast."

## Stack
- **Frontend**: React 18 + Vite, vanilla JSX (no router, no state lib)
- **Storage**: Session-only (`useState`) — data resets on page refresh. PostgreSQL backend is planned as phase two.
- **PDF export**: Browser print API via `window.open()` + `window.print()`
- **Tests**: Vitest + React Testing Library (to be configured)
- **Containerisation**: Docker + nginx (Dockerfile + docker-compose.yml)

## Repository Layout
```
dispatch/
├── README.md / CHANGELOG.md
├── .claude/context/       # Claude AI context files
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx           # React DOM root
    └── App.jsx            # Entire app — all state, components, logic
```

## Key Concepts
| Concept | Notes |
|---|---|
| Ticket | Core entity — has client info, services, hour logs, travel fee, status, priority |
| Service | Picked from SERVICES catalogue (business or residential); types: flat / per_unit / hourly |
| Hour log | Time entry with date, hours, rate, description — linked to a ticket |
| Travel fee | Fixed fee options: none / within 15km / 15–30km / 30+km |
| Client type | `business` or `residential` — controls which service catalogue is shown |

## Service Catalogue
Two catalogues in `SERVICES` constant:
- `business` — ~30 services: flat, per_unit, and hourly types; managed support plans, network setup, server work, etc.
- `residential` — ~10 services: hourly and per_unit; remote/on-site support, backup, etc.

## Ticket Lifecycle
Status: `Open` → `In Progress` → `Awaiting Client` → `Resolved` → `Closed`
Priority: `Low` | `Medium` | `High` | `Urgent`

## Pricing Logic (`App.jsx`)
- `calcServiceTotal(svc)` — computes subtotal per service line
- `calcHourTotal(logs)` — sums all hour log entries
- `calcGrandTotal(ticket)` — services + hours + travel
- `printTicket(ticket)` — generates print-ready HTML and opens `window.print()`

## Component Tree
```
App
├── TicketList        — dashboard: stats, search, filter, ticket rows
└── TicketEditor      — full ticket form
    ├── ServiceRow    — one service line item
    └── HourRow       — one hour log entry
```

## UI Patterns
- All state in `App` via `useState([])`
- `brand` object holds all design tokens — never hardcode colours
- `fmt(n)` for currency formatting
- `newTicket()` generates a fresh ticket with a `TKT-YEAR-NNNNN` ID
- PDF: `printTicket(ticket)` writes full HTML to a new window and calls `window.print()`

## Environment / Deployment
- Dev: `npm run dev` → http://localhost:5173
- Docker: `docker compose up -d --build` → http://localhost:3000
- Build: `npm run build` → `/dist`

## Phase Status
| Phase | Status |
|---|---|
| 1 — Core ticketing SPA | ✅ Complete |
| 2 — PostgreSQL backend + persistence | 🔲 Planned |
| 3 — Auth + multi-user | 🔲 Planned |
| 4 — Tether / Pulse integration | 🔲 Planned |
