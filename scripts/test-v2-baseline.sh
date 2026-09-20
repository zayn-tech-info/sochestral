#!/usr/bin/env bash
# Safe, provider-free Phase 0 regression checks. No live service configuration is read.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=test
pnpm --filter @sochestral/orchestration exec vitest run src/clerk-lock.test.ts src/campaign-loop.test.ts src/calendar.test.ts src/schedule-time.test.ts src/campaign-day.test.ts
npm --prefix web test -- src/components/app/schedule-calendar.test.tsx src/components/app/personal-settings.test.tsx src/components/app/plan-viewer.test.tsx
