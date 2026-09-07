# AGENTS.md

Durable context for AI tools working in the SocialMCP monorepo.

## Stack

TypeScript, pnpm workspaces, Node 22 (use `bash ./scripts/with-node22.sh` when the host Node is newer), SQLite + Drizzle, Vitest, MCP server (stdio), Hono API on port 3333, local worker for scheduled publish.

## Build approach

Tracer Bullet: prove one real path through every layer before widening scope.

## Commands

- `pnpm test` — adapter + mcp-server unit tests
- `pnpm --filter @socialmcp/worker test` — worker tests
- `pnpm --filter @socialmcp/api test` — API auth and route tests
- `pnpm --filter @socialmcp/shared test` — shared helpers (JWT)
- `pnpm --filter @socialmcp/oauth test` — OAuth session and callback tests
- `pnpm dev:api` — HTTPS OAuth callback API (`https://localhost:3333`)
- `pnpm dev:mcp` — MCP server
- `pnpm dev:worker` — scheduled post worker
- `pnpm db:migrate` — apply SQLite migrations
- `bash ./scripts/with-node22.sh pnpm --filter @socialmcp/cli dev connect <platform>` — OAuth connect CLI

## OAuth environment variables

Threads and Instagram use **separate Meta Developer apps**. Do not mix credentials.

| Platform | App credentials | Redirect URI |
|---|---|---|
| **Threads** | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` (fallback: `META_CLIENT_ID`, `META_CLIENT_SECRET`) | `THREADS_REDIRECT_URI` (fallback: `META_REDIRECT_URI`) → `/oauth/meta/callback` |
| **Instagram** | `META_CLIENT_ID`, `META_CLIENT_SECRET` only | `INSTAGRAM_REDIRECT_URI` → `/oauth/instagram/callback` |
| **LinkedIn Personal** | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `LINKEDIN_REDIRECT_URI` |

Shared: `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`, `SSL_KEY_PATH`, `SSL_CERT_PATH` for HTTPS localhost API. Threads webhooks: `THREADS_WEBHOOK_VERIFY_TOKEN` for `GET /webhooks/threads` subscription verify. Instagram webhooks: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` for `GET /webhooks/instagram` (HMAC with `META_CLIENT_SECRET`). User account tokens live encrypted in SQLite, never in `.env`.

Local MCP identity: optional `SOCIALMCP_USER_ID` (defaults to `user_local_default`). Product callers send `Authorization: Bearer` JWT (`sub` = user id, HS256 with `JWT_SECRET`). Local only helpers: `POST /auth/dev-token`, `GET /auth/me`. Every MCP tool, OAuth session, schedule, and publish path scopes by that `userId`.

Instagram Graph version: `INSTAGRAM_GRAPH_API_VERSION` (default `v21.0`).

## Product (Sochestral)

Business-strict AI social operator for three ICPs: physical product sellers (relevance and customers), founders launching a product (steady updates), and developers/builders who want to be seen while shipping. Not for casual “anyone who posts.” Prefer professional implementation and better practice defaults (official APIs, validated tool execution, review before live publish). Full intent and bar: `docs/scope/scope.md` and `docs/MASTER_PLAN.md`.

Progress lives in `docs/scope/scope.md` (Progress snapshot + At a glance) and `sochestral-master-plan.md` §2. Tracer Bullet path is proven on the cloud product URL. Slice 1 Features 4/5/14 are Done. Feature 7 (setup agent + business profile) is Done (SOC-12 / SOC-13). Feature 12 Done (SOC-9). Feature 13 intent clarify Done; Thesean Thinking close-out Canceled (SOC-8). Feature 6 tiers deferred. Channels wait. Next: Feature 10 remaining web surfaces / schedule calendar (SOC-14). Free beta access; billing is parallel and not a beta gate.

## Context files

- Product scope: `docs/scope/scope.md` (living; ignore stale `docs/scope.md`)
- Operational status + locked pricing: `sochestral-master-plan.md`
- Product vision: `docs/MASTER_PLAN.md`
- Platform capabilities: `docs/platform-capabilities.md`
- Instagram setup: `docs/platform-setup/instagram.md`
- Multi tenant identity: `docs/specs/0005-multi-tenant-identity.md`
- Specs: `docs/specs/`

## Agent skills

Skills live in `.agents/skills/` (project) and `.cursor/skills-cursor/` (Cursor built ins).

## Cursor Cloud specific instructions

Heads up: most of this file above (and `README.md`) describes the external **SocialMCP** infra repo and is stale for this checkout. This repo is the **Sochestral** hosted SaaS product (root `package.json` name `sochestral`). SocialMCP and the Thesean LLM are **external** cloud dependencies, not in this repo.

### Live stack (primary)

- **Product URL**: `https://app.sochestral.shop` (Fly app `sochestral`)
- **Product API**: `https://api.sochestral.shop` (Fly app `sochestral-api`, Hono)
- **Product Postgres**: **Neon** is the primary production database (`DATABASE_URL` secret on `sochestral-api`). Do not treat local Docker Postgres as the live story.
- **SocialMCP**: runs in cloud and is reached via `SOCIALMCP_MCP_URL` (product secret). Platform OAuth tokens stay in the MCP execution DB.
- **R2**: Cloudflare R2 private media is fully wired in cloud for Feature 12 uploads. Feature 12 live smoke Done (SOC-9); `PUBLISHING_AUTHORITY_ENABLED` is enabled in cloud after that smoke.
- **Thesean**: cloud LLM for orchestration. Extended Thesean Thinking UI was abandoned (SOC-8 Canceled); chat uses action labels + intent clarify instead. `THESEAN_THINKING_*` is soft-deprecated.

### Local agent / Cursor Cloud VM services (secondary)

These are for package tests and local UI work on the agent VM. They are **not** the production stack.

- Optional local **Postgres 16** on host port **5433** (role/password `sochestral`/`sochestral`, DBs `sochestral` and `sochestral_test`). On a fresh VM: `sudo pg_ctlcluster 16 main start`, then `pg_lsclusters`.
- **Product API** locally: `pnpm run dev:api` → `http://localhost:8787` (`/auth/login`, `/auth/me`, `/auth/mcp-token`, …).
- **Web** locally: `npm run dev` **from `web/`** → `http://localhost:3000`. `web/` is a standalone npm project (`package-lock.json`) and is **not** in the pnpm workspace (`pnpm-workspace.yaml` only lists `packages/*`), so it needs its own `npm install`.

### Gotchas

- Root pnpm scripts use colons in their names (`db:migrate`, `dev:api`, …). `pnpm db:migrate` is misread as a recursive filter and fails; always use `pnpm run db:migrate` (or `pnpm run dev:api`, etc.) from the repo root.
- `.env` is required for local work; copy it from `.env.example` (local Postgres/JWT defaults). For local migrate: `pnpm run db:migrate` and `DATABASE_URL=postgresql://sochestral:sochestral@localhost:5433/sochestral_test pnpm run db:migrate`.
- Package tests (`pnpm run test:database`, `test:auth`, `test:api`) need a migrated `sochestral_test` DB. Web tests/lint run without a DB: `npm run test` and `npm run lint` in `web/`.
- Cloud deploy configs: `fly.api.toml` (`sochestral-api`), `web/fly.toml` (`sochestral`). Production `DATABASE_URL` is the Neon connection string set as a Fly secret, not the `.env.example` localhost URL.

### Cloud Agent environment scripts

The Cloud Agent environment is snapshot-backed. `scripts/cloud-agent-install.sh` refreshes deps (`pnpm install --frozen-lockfile --prod=false`, `web` via `npm ci --include=dev`, with `NODE_ENV=development` so dev deps survive build hosts that set `NODE_ENV=production`) and seeds `.env`. `scripts/cloud-agent-start.sh` starts Postgres 16 (:5433) and a local MinIO S3 endpoint (:9000, console :9001, `minioadmin`/`minioadmin`), ensures the `sochestral`/`sochestral_test` DBs and the `sochestral-media` bucket, applies migrations, and launches the API (:8787) and web (:3000) dev servers. The API constructs a media store at boot, so local `.env` sets `R2_*` to that MinIO endpoint — without R2 values the API refuses to start and the `image-routes` tests fail with `STORAGE_UNAVAILABLE`.

Caveat: Cloud Agents for this repo may inject production secrets (`DATABASE_URL`=Neon prod, `NODE_ENV=production`, `PORT=8080`, `CORS_ORIGIN`=prod) into the shell, and the apps load `.env` without `override`, so those injected values win. The start script pins local values for everything it launches (migrations and both servers), but a **manually** run `pnpm run db:migrate` would target production Neon, and `pnpm run test:api` fails one `cors-origin` case under the injected prod env (green with `env -u CORS_ORIGIN NODE_ENV=development`). Rescope those production secrets to the `sochestral-api` Fly app (not the Cloud Agent environment) to make manual commands and tests safe by default.

### Provision + login (local, no external deps)

`pnpm run db:provision <email>` then `pnpm run db:set-password <email> <password>`, then log in at `http://localhost:3000/login`. This exercises local Postgres + API + auth only.

### Cloud vs local for chat / publish

On the **product URL**, chat and publish use cloud Thesean + cloud SocialMCP. On a **local/agent** checkout without `THESEAN_API_KEY` and a reachable `SOCIALMCP_MCP_URL`, login and workspace UI still work, but sending a chat message or publishing fails closed. That is expected for this repo when external services are not pointed at cloud.
