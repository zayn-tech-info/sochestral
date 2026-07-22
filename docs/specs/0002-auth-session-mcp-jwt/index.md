# 0002. Auth session and MCP JWT issuance

**Date**: 2026-07-22
**Status**: Accepted

## Summary

This decision adds product sign in for the hosted SaaS app and a way to mint short lived SocialMCP caller tokens. A provisioned user signs in with email and password, gets an HttpOnly cookie session, and the server can mint a Bearer JWT whose `sub` is the same `users.id` string SocialMCP already trusts. Platform OAuth tokens stay in SocialMCP; the product never puts them in the session or the MCP JWT.

## Requirements

**User stories**:
- As a provisioned product user, I want to sign in with email and password so the SaaS app knows who I am.
- As the orchestration layer (and local smoke tests), I want a short lived MCP JWT with `sub` = my `users.id` so SocialMCP scopes tools to my tenant without using `user_local_default`.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A migration extends `users` with nullable `password_hash` and creates a `sessions` table (`id`, `user_id` FK cascade, unique `token_hash`, `expires_at`, `created_at`) with an index on `user_id`.
- **AC-2**: A local `pnpm` set password script (user id or email + password) writes an Argon2id `password_hash`; unknown user exits nonzero with `USER_NOT_FOUND`; password shorter than 8 characters exits nonzero with `PASSWORD_TOO_SHORT`. It is not a public HTTP route.
- **AC-3**: `POST /auth/login` with `{ email, password }` for a provisioned user who has a hash creates a session row (opaque raw token = `nanoid(32)`, `token_hash` = SHA-256 hex of that token, absolute `expires_at` = now + 7 days), sets an HttpOnly cookie named `sochestral_session` (`Secure` in production, `SameSite=Lax`, `Path=/`, no Domain attribute), and returns `200` `{ id, email }`. Email is trimmed and lowercased before lookup (same canonical form as 0001).
- **AC-4**: Bad password, unknown email, or null `password_hash` all return `401` `{ error: "INVALID_CREDENTIALS" }` with no session cookie set. Always run Argon2id verify against a real hash or a fixed dummy hash so missing user / null hash does not short circuit timing; no distinct “user missing” vs “bad password” vs “password not set”.
- **AC-5**: `GET /auth/me` and `POST /auth/mcp-token` require a valid, unexpired session cookie; otherwise `401`. Expired sessions are treated as logged out (cookie cleared when practical).
- **AC-6**: `POST /auth/logout` deletes the matching `sessions` row and clears the cookie.
- **AC-7**: Given a valid session, `mintMcpJwt(userId)` and `POST /auth/mcp-token` return an HS256 JWT (via `jose`) with claims `sub` (= session’s `users.id` only, never a body `userId`), `iat`, and `exp` (15 minutes), signed with `JWT_SECRET`. Response shape for the HTTP route: `{ token, expiresAt }`.
- **AC-8**: Missing or blank `JWT_SECRET` makes mint fail fast with an error that names `JWT_SECRET`; the HTTP smoke route returns `500` with a stable code (`JWT_SECRET_MISSING`).
- **AC-9**: Product session JSON and MCP JWT payloads never include `password_hash`, raw session tokens, or platform OAuth tokens.
- **AC-10**: A minimal Next.js login page (email + password) posts to `POST {NEXT_PUBLIC_API_URL}/auth/login` so the Tracer Bullet path works in a browser. Product Hono API listens on port `8787` locally by default.

## Decision

**Chosen option**: Option 1: Self hosted Argon2id + opaque DB sessions + jose MCP JWT

Ship product auth as: `@node-rs/argon2` password hashes on `users`, opaque HttpOnly cookie sessions stored as SHA-256 hex of a `nanoid(32)` raw token in `sessions`, Hono routes on a product API package (local port `8787`), a minimal Next login page via `NEXT_PUBLIC_API_URL`, and `jose` HS256 mint for SocialMCP with `sub` = `users.id` and 15 minute expiry. Cookie name: `sochestral_session`. Session row ids: `sess_` + `nanoid(21)`. Minimum password length: 8 characters (login: `INVALID_CREDENTIALS`; CLI: `PASSWORD_TOO_SHORT`).

**Implementation skills**: `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`) · `auth-implementation-patterns` (`wshobson/agents`, `.agents/skills/auth-implementation-patterns/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

`users` (extend 0001)
| Column | DB type | Required | Notes |
|---|---|---|---|
| `password_hash` | text | no | Argon2id; null until set password CLI runs |

`sessions` (new)
| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | app: `sess_` + nanoid(21) |
| `user_id` | text FK → `users.id` ON DELETE CASCADE | yes | owner |
| `token_hash` | text unique | yes | SHA-256 hex of cookie raw token (`nanoid(32)`) |
| `expires_at` | timestamptz | yes | absolute: created_at + 7 days |
| `created_at` | timestamptz | yes | DB default `now()` |

Indexes: unique on `token_hash`; index on `user_id`. Many concurrent sessions per user allowed.

**State transitions**:

Session: created on login → valid until `expires_at` or logout delete → gone. No soft revoke column in Slice 1.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `POST /auth/login` | HTTP | `{ email, password }` | `{ id, email }` + Set-Cookie | public | `401 INVALID_CREDENTIALS` |
| `POST /auth/logout` | HTTP | cookie | empty + clear cookie | session | `401` if no session |
| `GET /auth/me` | HTTP | cookie | `{ id, email }` | session | `401` |
| `POST /auth/mcp-token` | HTTP | cookie | `{ token, expiresAt }` | session | `401`; `500 JWT_SECRET_MISSING` |
| `mintMcpJwt(userId)` | TS helper | `userId` from trusted caller | JWT string | in process | missing `JWT_SECRET` |
| set password `pnpm` script | CLI | user id or email + password | ok / error | local/ops | `USER_NOT_FOUND`; `PASSWORD_TOO_SHORT` |

Login page: Next.js form → `POST {NEXT_PUBLIC_API_URL}/auth/login` (AC-10). Local API default `http://localhost:8787`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| set password CLI | `password_hash` | Argon2id hash of CLI password input via `@node-rs/argon2` |
| set password CLI | target user | lookup by CLI user id or canonical email (trim+lowercase) |
| set password CLI | `PASSWORD_TOO_SHORT` | password length shorter than 8 |
| login | email lookup key | request email trimmed + lowercased (0001 canonical form) |
| login | session `id` | `sess_` + nanoid(21) |
| login | session `token_hash` | SHA-256 hex of app generated `nanoid(32)` raw token |
| login | cookie value | raw opaque token (only in Set-Cookie, never in JSON) |
| login | `expires_at` | `now()` + 7 days (absolute) |
| login / me | `id`, `email` | `users.id`, `users.email` after successful auth |
| login failure | `INVALID_CREDENTIALS` | fixed string; Argon2 verify uses real hash or fixed dummy hash |
| mcp-token / mint | JWT `sub` | `users.id` from validated session `user_id` only |
| mcp-token / mint | JWT `exp` | `iat` + 15 minutes |
| mcp-token / mint | signature | HS256 with env `JWT_SECRET` |
| mcp-token | `expiresAt` | derived from JWT `exp` (ISO timestamp) |

**Key invariants**:
- MCP JWT `sub` always equals a real `users.id` from a validated session (or an in process caller that already trusts that id); never from request body.
- Raw session token appears only in the HttpOnly cookie, never in JSON responses or logs.
- `password_hash` never returned in API JSON.
- Product auth does not store or return platform OAuth tokens.

**Security model**:
- Login is public. Logout, me, and mcp-token require a valid session.
- Set password is local CLI / ops only.
- Email is PII; do not log passwords; login failure logs may include email at info level only if needed, never the password.
- Rate limiting on login is deferred (Follow-up); generic errors still apply.

**Configuration required**:
- `JWT_SECRET`: shared HS256 secret with SocialMCP (required to mint)
- `DATABASE_URL`: existing product Postgres (from 0001)
- `NEXT_PUBLIC_API_URL`: browser base URL for the product API (local default `http://localhost:8787`)
- `PORT` (optional): Hono listen port (local default `8787`)
- Cookie `Secure` flag: on when `NODE_ENV=production` (or equivalent)

**Critical test scenarios**:
- Happy path: set password → login → me → mcp-token → JWT `sub` matches user id, verifies **AC-2**, **AC-3**, **AC-5**, **AC-7**, **AC-10**
- Failure case: wrong password / unknown email / null hash → `INVALID_CREDENTIALS`; mint without `JWT_SECRET` → fail naming the var, verifies **AC-4**, **AC-8**
- Auth/permission: mcp-token and me without cookie → `401`; response bodies have no hash or platform tokens, verifies **AC-5**, **AC-9**
- Logout: session row removed; subsequent me is `401`, verifies **AC-6**

## Build plan

Approach: Tracer Bullet (thin path: migrate → set password → login → me → mint JWT → minimal login page).

1. [x] Migrate: add `users.password_hash`, create `sessions` with constraints and indexes, satisfies **AC-1**
2. [x] Implement password hash helpers, session create/validate/delete (hashed token), and `mintMcpJwt` with `jose`, satisfies **AC-2**, **AC-7**, **AC-8**, **AC-9**
3. [x] Scaffold product Hono API (`packages/api`) with login, logout, me, mcp-token routes and cookie wiring, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**
4. [x] Add set password `pnpm` script, satisfies **AC-2**
5. [x] Add minimal Next.js login page posting to the API, satisfies **AC-10**
6. [x] Smoke the path against Docker Postgres (set password, login, me, mcp-token), satisfies **AC-3**, **AC-5**, **AC-7**

## Consequences

**Positive**:
- Real SaaS identity for Slice 1 without `user_local_default`
- Clear split: product cookie session vs short lived MCP JWT
- Builds on 0001 `users.id` contract

**Negative / tradeoffs**:
- No password reset or lockout yet
- Team owns session cleanup of expired rows (can be a later job)
- Login rate limit deferred

**Neutral**:
- New packages/skills: Hono API surface; `hono` and `auth-implementation-patterns` skills installed for `/develop`
- `/sync` should list new env vars and skills in `AGENTS.md`

## Follow-up

- [ ] `/sync`: document `JWT_SECRET`, cookie session, Hono API package, and bullets for `hono` + `auth-implementation-patterns` in `AGENTS.md`
- [ ] Login rate limiting and optional lockout after N failures
- [ ] Password reset email and public signup (later features)
- [ ] Expired session row reaper job
- [ ] Feature 3 (orchestration) should call `mintMcpJwt` in process rather than relying on the browser smoke route alone
