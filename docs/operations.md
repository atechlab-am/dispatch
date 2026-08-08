# Operations guide

Day-2 operations reference: health checks, logs, and common failure modes. For install/update/
backup/restore/Postgres-upgrade procedures, see the [README](../README.md) — this doc doesn't
repeat those.

## Services

`docker compose ps` shows four services:

| Service          | Purpose                                  | Port (host)         |
|-------------------|-------------------------------------------|----------------------|
| `postgres`         | Database                                   | not exposed by default |
| `backend`           | FastAPI app, serves `/api/*`               | not exposed directly (proxied) |
| `frontend`          | Staff app (nginx, serves built SPA + proxies `/api`) | 80 |
| `frontend-portal`   | Client Portal (nginx, separate build target) | `PORTAL_PORT` (default 8080) |

`frontend` and `frontend-portal` both `depends_on: backend` with `condition: service_healthy` —
they won't start until the backend's own healthcheck passes.

## Health checks

- Backend: `GET /health` (unauthenticated) — checks it can run `SELECT 1` against Postgres.
  Returns `{"ok": true}` (200) or `{"ok": false, "error": "db_unavailable"}` (503).
  ```bash
  curl http://localhost/api/health   # via frontend's proxy
  ```
- Postgres: compose healthcheck runs `pg_isready` every 5s.
- Backend: compose healthcheck curls `/health` every 10s.

`docker compose ps` shows `healthy`/`unhealthy`/`starting` per service — check this first when
something won't come up.

## Logs

```bash
docker compose logs -f backend           # most app errors surface here
docker compose logs -f postgres
docker compose logs -f frontend frontend-portal   # nginx access/error logs
docker compose logs -f --tail 200 backend         # last 200 lines, no follow
```

No external log aggregation by default — logs live in each container's stdout/stderr, subject
to Docker's own log rotation settings.

## Common failure modes

**Backend stuck `unhealthy` / restarting**
- `docker compose logs backend` — almost always a startup-time error: bad `DATABASE_URL`,
  missing `SECRET_KEY`, or a failed migration.
- Confirm `postgres` is `healthy` first (`docker compose ps`) — the backend won't even start
  its own healthcheck loop meaningfully if Postgres isn't reachable.

**Frontend/portal won't start**
- Check `backend` is `healthy` — both depend on it via `condition: service_healthy` and will
  sit in `Created`/`Waiting` until it is.

**502/504 from nginx**
- Backend container is down or still starting — `docker compose ps`, then `docker compose logs
  backend`.

**Migrations didn't apply after an update**
- `upgrade.sh`/`scripts/*/update.*` run migrations automatically on backend startup — check
  `docker compose logs backend` for Alembic output near the top of the log (that's where startup
  logs land, before request logs start interleaving).
- To check current migration state manually:
  ```bash
  docker compose exec backend alembic current
  docker compose exec backend alembic history
  ```

**Need a one-off shell into a container**
```bash
docker compose exec backend bash
docker compose exec postgres psql -U ${POSTGRES_USER:-dispatch} -d ${POSTGRES_DB:-dispatch}
```

**Stripe webhook not firing**
- The webhook endpoint (`/api/payments/webhook`) is proxied through `nginx.portal.conf` by
  default — no manual nginx config needed. If webhooks still aren't arriving: confirm the
  webhook URL configured in the Stripe dashboard points at the Client Portal's public URL
  (`PORTAL_URL`) + `/api/payments/webhook`, and that `STRIPE_WEBHOOK_SECRET` matches the
  signing secret Stripe shows for that endpoint.

## Where things live

- Uploaded files (ticket attachments, document library): Docker volume `uploads_data`, mounted
  at `/app/uploads` in the `backend` container.
- Database: Docker volume `postgres_data`.
- `.env`: repo root, next to `docker-compose.yml` — not itself in a volume, lives on the host.
