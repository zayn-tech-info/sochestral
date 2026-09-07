#!/usr/bin/env bash
# Cloud Agent install phase: refresh dependencies and local dev config.
# Idempotent. System services (Postgres, MinIO) live in the environment
# snapshot and are started per-boot by scripts/cloud-agent-start.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
