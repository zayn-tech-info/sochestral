# Verify: multi tenant identity · spec 0005 · updated 2026-07-15

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `pnpm db:migrate` then inspect SQLite for `users.status` and `oauth_sessions.user_id` → AC-1, AC-3
- [ ] Start API (`pnpm dev:api` or HTTP on `PORT`) with `SOCIALMCP_MODE=local` and `JWT_SECRET` set → surface ready
- [ ] `POST /auth/dev-token` with `{ "userId": "verify_user_a" }` → `{ ok, token, userId }` → AC-1, AC-6
- [ ] `GET /auth/me` with `Authorization: Bearer <token>` → `{ ok, userId: "verify_user_a" }` → AC-1
- [ ] `POST /auth/dev-token` with `SOCIALMCP_MODE=production` → HTTP 403 → AC-6
- [ ] Two ToolContext users: list_connected_accounts for A never returns B’s accounts → AC-2, AC-5
- [ ] Cancel or publish path with B’s `connectedAccountId` as A → not found → AC-2
- [ ] `create` OAuth session with `userId=A`; row stores `user_id=A` → AC-3
- [ ] Set `users.status=disabled` then `ensureCurrentUser` / connect_account → USER_DISABLED → AC-7
- [ ] Worker schedule row: account.userId mismatch vs row.userId fails before publish → AC-4
- [ ] Confirm no product signup UI routes (no `/auth/signup`, etc.) → AC-6

## Acceptance-criteria coverage

- AC-1 · ToolContext + JWT `/auth/dev-token` + `/auth/me`
- AC-2 · scoped list + cross user not found
- AC-3 · oauth_sessions.user_id + migration columns
- AC-4 · worker ownership assert
- AC-5 · two user isolation exercise
- AC-6 · local only dev token + no signup UI
- AC-7 · disabled user rejection
