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

## Context files

- Product scope: `docs/scope/scope.md`
- Platform capabilities: `docs/platform-capabilities.md`
- Instagram setup: `docs/platform-setup/instagram.md`
- Multi tenant identity: `docs/specs/0005-multi-tenant-identity.md`
- Specs: `docs/specs/`

## Agent skills

Skills live in `.agents/skills/` (project) and `.cursor/skills-cursor/` (Cursor built ins).
