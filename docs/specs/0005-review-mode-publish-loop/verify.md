# Verify review mode publish loop

## Status (2026-08-07)

**Done** for Feature 5 close out. Live review publish smoke with SocialMCP is satisfied by engineer confirmation on the cloud stack (Linear SOC-6, SOC-19). Earlier local-agent BLOCKED rows below are historical; they no longer gate the feature.

Proven path on `https://app.sochestral.shop`: draft → edit in live preview aside → approve → SocialMCP publish → live result.

---

## Automated proof (product repo)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Apply product migration to test DB; legacy drafts survive with empty ordered media | **PASS** | `sochestral_test` migrated; `packages/database` review tests green (`review.test.ts`) |
| 2 | Product database, orchestration, API, auth, and web tests with isolated test DB | **PASS** | Recorded under SOC-6 automated proof (database / auth / API / orchestration / web suites green) |
| 3 | SocialMCP database, MCP server, adapter, shared contract tests (external repo) | **N/A here** | External SocialMCP repo; cloud MCP is the live dependency for this product |
| 4 | Product type checks, lint, and production builds | **PASS / PARTIAL** | Web lint clean enough for ship; cloud apps deploy on Fly |

## Product behavior

| # | Check | Result |
|---|-------|--------|
| 1–9 | Draft → edit → approve → idempotency → partial/unknown → restore → delete guards | **Done (cloud)** | Unit coverage in `review-routes.test.ts` and orchestration review/service tests; live path proven on product URL (SOC-19) |

## Security and accessibility

| # | Check | Result |
|---|-------|--------|
| 1–3 | Tenant isolation, Origin / request headers, no secret leakage | **PASS (automated)** | Exercised in `review-routes.test.ts` / API auth tests |
| 4–5 | Keyboard / a11y / mobile for preview aside | **Done (cloud)** | Covered with Feature 14 live use on product URL (SOC-7) |

## Manual live proof

| Check | Result |
|-------|--------|
| Harmless live posts via SocialMCP on the product URL | **Done** | Engineer confirmed Tracer Bullet publish path (SOC-19). Platform mix as available on connected accounts. |

## Overall

**Done** (cloud proof, Linear SOC-6 / SOC-19). Product automated suite remains green.
