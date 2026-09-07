#!/usr/bin/env bash
# Cloud Agent start phase: bring up per-boot services and reconcile DB state.
# Idempotent and safe to re-run. Binaries and data dirs are provided by the
# environment snapshot; this script only (re)starts processes and applies
# any pending migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_PORT=5433
PG_URL="postgresql://sochestral:sochestral@localhost:${PG_PORT}"

# Defensive local dev config. Cloud Agents for this repo may inject production
# secrets (DATABASE_URL=Neon prod, NODE_ENV=production, PORT=8080, CORS_ORIGIN=
# prod) into the shell; the apps load .env without override, so those injected
# values would otherwise win — pointing migrations/API at PRODUCTION and
# breaking local ports. We pin the local values below for everything we launch.
LOCAL_DB_URL="${PG_URL}/sochestral"
LOCAL_TEST_DB_URL="${PG_URL}/sochestral_test"

echo "[cloud-agent-start] starting PostgreSQL 16 on :${PG_PORT}"
sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  pg_isready -h localhost -p "${PG_PORT}" -q && break
  sleep 1
done

echo "[cloud-agent-start] ensuring role and databases"
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_roles WHERE rolname='sochestral'" | grep -q 1 \
  || sudo -u postgres psql -p "${PG_PORT}" -c "CREATE ROLE sochestral LOGIN PASSWORD 'sochestral' CREATEDB"
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_database WHERE datname='sochestral'" | grep -q 1 \
  || sudo -u postgres createdb -p "${PG_PORT}" -O sochestral sochestral
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_database WHERE datname='sochestral_test'" | grep -q 1 \
  || sudo -u postgres createdb -p "${PG_PORT}" -O sochestral sochestral_test

echo "[cloud-agent-start] starting MinIO (S3-compatible store for R2/media)"
if ! curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
  sudo mkdir -p /var/lib/minio/data
  sudo chown -R "$(id -un)":"$(id -gn)" /var/lib/minio
  MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
    nohup /usr/local/bin/minio server /var/lib/minio/data \
      --address :9000 --console-address :9001 >/tmp/minio.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1 && break
    sleep 1
  done
fi
mc alias set localminio http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1 || true
mc mb --ignore-existing localminio/sochestral-media >/dev/null 2>&1 || true

echo "[cloud-agent-start] applying migrations (pinned to local DB)"
DATABASE_URL="${LOCAL_DB_URL}" pnpm run db:migrate
DATABASE_URL="${LOCAL_TEST_DB_URL}" pnpm run db:migrate

# --- Application dev servers (fully detached; logs in /tmp) ---
# setsid + </dev/null detaches these from this script's stdout so `start`
# returns cleanly instead of blocking on the servers' inherited pipe. Each
# server gets its local env pinned so injected production values cannot
# redirect it to prod or change its port.
echo "[cloud-agent-start] starting API (:8787) and web (:3000)"
if ! curl -sf http://localhost:8787/health >/dev/null 2>&1; then
  setsid bash -c 'cd "'"${ROOT}"'" && export DATABASE_URL="'"${LOCAL_DB_URL}"'" NODE_ENV=development PORT=8787 CORS_ORIGIN=http://localhost:3000 PUBLIC_API_URL=http://localhost:8787 && exec pnpm run dev:api' </dev/null >/tmp/sochestral-api.log 2>&1 &
fi
if ! curl -sf http://localhost:3000/login >/dev/null 2>&1; then
  setsid bash -c 'cd "'"${ROOT}"'/web" && export NODE_ENV=development PORT=3000 NEXT_PUBLIC_API_URL=http://localhost:8787 && exec npm run dev' </dev/null >/tmp/sochestral-web.log 2>&1 &
fi

echo "[cloud-agent-start] services ready"
