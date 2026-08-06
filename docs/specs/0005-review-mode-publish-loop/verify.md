# Verify review mode publish loop

Recorded during Tracer Bullet close out (SOC-6), 2026-08-05.

## Automated proof

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Apply product migration to test DB; legacy drafts survive with empty ordered media | **PASS** | `sochestral_test` migrated; `packages/database` review tests green (`review.test.ts`) |
| 2 | Product database, orchestration, API, auth, and web tests with isolated test DB | **PASS** | `pnpm run test:database` 43/43; `test:auth` 25/25; `test:api` 34/34; `@sochestral/orchestration` 97/97 (after fixing `model.test.ts` thinking field); web preview + chat-workspace 16/16 |
| 3 | SocialMCP database, MCP server, adapter, shared contract tests (external repo) | **BLOCKED** | SocialMCP not available in this checkout |
| 4 | Product and SocialMCP type checks, lint, and production builds | **PARTIAL** | Web `npm run lint` clean (1 unused-import warning). SocialMCP build N/A here |

## Product behavior

| # | Check | Result |
|---|-------|--------|
| 1–9 | Draft → edit → approve → idempotency → partial/unknown → restore → delete guards | **BLOCKED** | Needs Thesean + SocialMCP + connected accounts. Covered in unit form by `review-routes.test.ts` and orchestration review/service tests with mocks. |

## Security and accessibility

| # | Check | Result |
|---|-------|--------|
| 1–3 | Tenant isolation, Origin / request headers, no secret leakage | **PARTIAL** | Exercised in `review-routes.test.ts` / API auth tests; not re-driven live in browser this run |
| 4–5 | Keyboard / a11y / mobile for preview aside | **BLOCKED** | Pair with SOC-7 live UI verify |

## Manual live proof

| Check | Result |
|-------|--------|
| Harmless live posts to Threads, LinkedIn Personal, Instagram | **BLOCKED** | Needs SocialMCP + live platform accounts |

## Overall

**BLOCKED** for Feature 5 Verify close until SocialMCP live path exists. Product automated suite for this repo is green.
