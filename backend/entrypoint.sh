#!/bin/sh
set -e
mkdir -p /app/uploads/documents
python3 -m alembic upgrade head
exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --workers ${WEB_CONCURRENCY:-2} \
    --bind 0.0.0.0:8000 \
    --access-logfile - \
    --error-logfile -
