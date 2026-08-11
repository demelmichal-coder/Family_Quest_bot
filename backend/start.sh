#!/bin/sh
# Spusti migrace a FastAPI backend
set -e
cd /app
python -m alembic upgrade head
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
