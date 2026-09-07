#!/usr/bin/env bash
# Cloud Agent install phase: provision system services and project deps.
# Idempotent and safe to re-run. Runs once at build time to create the
# environment baseline; scripts/cloud-agent-start.sh then starts services
# per boot. Self-contained (no prebuilt snapshot required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_PORT=5433

# --- System dependencies: PostgreSQL 16 + MinIO (S3-compatible store) ---
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "[cloud-agent-install] installing PostgreSQL 16"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-client-16
fi
# Pin the cluster to :5433 (matches .env.example / AGENTS.md).
if [ -d /etc/postgresql/16/main ]; then
  sudo pg_conftool 16 main set port "${PG_PORT}" || true
fi

if [ ! -x /usr/local/bin/minio ]; then
  echo "[cloud-agent-install] installing MinIO server"
  sudo curl -fsSL -o /usr/local/bin/minio https://dl.min.io/server/minio/release/linux-amd64/minio
  sudo chmod +x /usr/local/bin/minio
fi
if [ ! -x /usr/local/bin/mc ]; then
  echo "[cloud-agent-install] installing MinIO client (mc)"
  sudo curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc
  sudo chmod +x /usr/local/bin/mc
fi
sudo mkdir -p /var/lib/minio/data
sudo chown -R "$(id -un)":"$(id -gn)" /var/lib/minio

# --- Project dependencies ---
corepack enable >/dev/null 2>&1 || true

# Workspace packages (pnpm) + standalone web app (npm, not in the pnpm workspace).
# Force dev dependencies: build/CI hosts often set NODE_ENV=production, which
# would otherwise omit vitest, drizzle-kit, tailwind, eslint, typescript, etc.
export NODE_ENV=development
pnpm install --frozen-lockfile --prod=false
(cd web && npm ci --include=dev --no-audit --no-fund)

# Local .env for agent/dev work (gitignored). Seed from the example if absent.
if [ ! -f .env ]; then
  cp .env.example .env
fi

# Point R2/media at the local MinIO S3 endpoint so the API can boot and the
# media/image tests pass locally. These are dev-only placeholders, never prod.
sed -i 's|^R2_ENDPOINT=.*|R2_ENDPOINT=http://localhost:9000|' .env
sed -i 's|^R2_ACCESS_KEY_ID=.*|R2_ACCESS_KEY_ID=minioadmin|' .env
sed -i 's|^R2_SECRET_ACCESS_KEY=.*|R2_SECRET_ACCESS_KEY=minioadmin|' .env
sed -i 's|^R2_BUCKET=.*|R2_BUCKET=sochestral-media|' .env

echo "[cloud-agent-install] done"
