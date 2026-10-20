# ── Stage 1: build Vite/Preact frontend ─────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN VITE_USE_BACKEND=true npm run build

# ── Stage 2: combined runtime (nginx + uvicorn in one container) ─────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends nginx wget \
 && rm -rf /var/lib/apt/lists/*

# Backend
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# Frontend static files
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# nginx config: proxies /api/ to localhost:8000
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 9443
CMD ["/docker-entrypoint.sh"]
