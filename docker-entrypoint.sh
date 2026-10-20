#!/bin/sh
set -e

cd /app

# Create tables + seed default users (idempotent)
python seed.py

# FastAPI in background
uvicorn app.main:app --host 127.0.0.1 --port 8000 &

# nginx in foreground — keeps the container alive
exec nginx -g "daemon off;"
