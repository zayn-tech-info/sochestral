# Verify: Auth session and MCP JWT issuance · spec 0002 · updated 2026-07-22

_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Open `/login` → enter email and password for a provisioned user with a set password → expect success status from `POST {NEXT_PUBLIC_API_URL}/auth/login` (cookie set) → AC-10
- [ ] With session cookie, call me and mcp-token from browser or curl → expect user JSON and JWT (no password hash in body) → AC-5, AC-7, AC-9

## Commands

- [ ] `pnpm db:migrate` (with live `DATABASE_URL`) → `users.password_hash` and `sessions` exist → AC-1
- [ ] `pnpm db:set-password <userId|email> '<password>=8chars>'` → JSON `{ id, email, passwordSet: true }` → AC-2
- [ ] `pnpm db:set-password missing@example.com 'password123'` → `USER_NOT_FOUND`, nonzero exit → AC-2
- [ ] `pnpm db:set-password <id> 'short'` → `PASSWORD_TOO_SHORT`, nonzero exit → AC-2
- [ ] `curl -c jar -X POST localhost:8787/auth/login -H 'Content-Type: application/json' -d '{"email":"…","password":"…"}'` → `200` `{ id, email }` and `sochestral_session` cookie → AC-3
- [ ] Same login with wrong password / unknown email / user with null hash → `401` `{ "error": "INVALID_CREDENTIALS" }`, no session → AC-4
- [ ] `curl -b jar localhost:8787/auth/me` → `200` `{ id, email }`; without cookie → `401` → AC-5
- [ ] `curl -b jar -X POST localhost:8787/auth/mcp-token` → `{ token, expiresAt }`; decode JWT → `sub` = user id, `iat`/`exp` (~15 minutes) → AC-7
- [ ] `JWT_SECRET=` mint helper or restart API without secret → fail naming `JWT_SECRET` / HTTP `500 JWT_SECRET_MISSING` → AC-8
- [ ] `curl -b jar -X POST localhost:8787/auth/logout` → session row gone; me → `401` → AC-6
- [ ] Inspect login/me/mcp-token JSON → no `password_hash`, no raw session token, no platform OAuth tokens → AC-9

## Value sourcing

- [ ] Set password hash comes from Argon2id of CLI password; lookup uses id or canonical email
- [ ] Login email lookup uses trim+lowercase; session id is `sess_` + nanoid(21); `token_hash` is SHA-256 of `nanoid(32)` cookie value
- [ ] MCP JWT `sub` comes only from validated session `user_id`; signature uses env `JWT_SECRET`

## Acceptance-criteria coverage

- AC-1 covered by migrate / schema inspect
- AC-2 covered by set password CLI cases
- AC-3 covered by login success command
- AC-4 covered by login failure command
- AC-5 covered by me with/without cookie
- AC-6 covered by logout then me
- AC-7 covered by mcp-token + JWT decode
- AC-8 covered by missing `JWT_SECRET`
- AC-9 covered by response body inspect
- AC-10 covered by `/login` UI step
