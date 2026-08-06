#!/usr/bin/env bash
# Run product API on Fly: migrate Postgres, then Hono.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-8080}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[sochestral-api] DATABASE_URL is required" >&2
  exit 1
fi

echo "[sochestral-api] applying migrations..." >&2
pnpm --filter @sochestral/database migrate

echo "[sochestral-api] starting on port ${PORT}..." >&2
exec pnpm --filter @sochestral/api start
