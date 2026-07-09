FROM python:3.12-slim AS base

WORKDIR /app

# ── Test target ────────────────────────────────────────────────────────────────
FROM base AS test

COPY backend/requirements-dev.txt backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY backend/ .
COPY VERSION /app/VERSION

ENV DATABASE_URL=sqlite:///./test.db
ENV SECRET_KEY=test-secret-key-at-least-32-chars-long
CMD ["python3", "-m", "pytest", "tests/", "-v"]

# ── Production target ──────────────────────────────────────────────────────────
FROM base AS production

# postgresql-client provides pg_dump/pg_restore, used by the backup feature
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY VERSION /app/VERSION

RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app && chmod +x entrypoint.sh
USER app

CMD ["./entrypoint.sh"]
