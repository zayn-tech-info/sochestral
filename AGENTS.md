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

Progress lives in `docs/scope/scope.md` (Progress snapshot + At a glance). Foundation and Slice 1 are largely built; close outs are verify/live smoke and Feature 12 rollout. Slice 2 (tiers, setup agent, channels) is not started.

## Context files

- Product scope: `docs/scope/scope.md` (living; ignore stale `docs/scope.md`)
- Product vision: `docs/MASTER_PLAN.md`
- Platform capabilities: `docs/platform-capabilities.md`
- Instagram setup: `docs/platform-setup/instagram.md`
- Multi tenant identity: `docs/specs/0005-multi-tenant-identity.md`
- Specs: `docs/specs/`

## Agent skills

Skills live in `.agents/skills/` (project) and `.cursor/skills-cursor/` (Cursor built ins).

## Cursor Cloud specific instructions

Heads up: most of this file above (and `README.md`) describes the external **SocialMCP** infra repo and is stale for this checkout. This repo is actually the **Sochestral** hosted SaaS product (root `package.json` name `sochestral`). The real, runnable services here are a Next.js web app, a Hono API, and Postgres. SocialMCP and the Thesean LLM are **external** dependencies, not in this repo.

### Services

- **Postgres 16** on host port **5433** (not the default 5432). Role/password `sochestral`/`sochestral`, databases `sochestral` and `sochestral_test`. The update script does not manage Postgres; on a fresh VM boot start it with `sudo pg_ctlcluster 16 main start`, then confirm with `pg_lsclusters`. Data and the port config persist in the snapshot.
- **Product API** (`@sochestral/api`, Hono): `pnpm run dev:api` → `http://localhost:8787`. Routes include `/auth/login`, `/auth/me`, `/auth/mcp-token`.
- **Web** (Next.js): run `npm run dev` **from `web/`** → `http://localhost:3000`. `web/` is a standalone npm project with its own `package-lock.json` and is **not** part of the pnpm workspace (`pnpm-workspace.yaml` only lists `packages/*`), so it needs its own `npm install`.

### Gotchas

- Root pnpm scripts use colons in their names (`db:migrate`, `dev:api`, …). `pnpm db:migrate` is misread as a recursive filter and fails; always use `pnpm run db:migrate` (or `pnpm run dev:api`, etc.) from the repo root.
- `.env` is required; copy it from `.env.example` (its local Postgres/JWT defaults already work). Run `pnpm run db:migrate` for the main DB and `DATABASE_URL=postgresql://sochestral:sochestral@localhost:5433/sochestral_test pnpm run db:migrate` for the test DB.
- Package tests (`pnpm run test:database`, `test:auth`, `test:api`) need a migrated `sochestral_test` DB. Web tests/lint run without a DB: `npm run test` and `npm run lint` in `web/`.

### Provision + login (no external deps)

`pnpm run db:provision <email>` then `pnpm run db:set-password <email> <password>`, then log in at `http://localhost:3000/login`. This exercises Postgres + API + auth end-to-end.

### External-only features

Chat orchestration needs `THESEAN_API_KEY` (Thesean LLM) plus a running SocialMCP server at `SOCIALMCP_MCP_URL`; connectors/publishing need the SocialMCP OAuth service. Without those, login and the workspace UI work, but sending a chat message or publishing will fail. That is expected in this repo, not a broken setup.
