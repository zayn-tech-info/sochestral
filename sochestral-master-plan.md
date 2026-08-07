# Sochestral master plan (operational)

Living operational status and locked product decisions for agents and Linear.
Full product vision and architecture narrative: `docs/MASTER_PLAN.md`.
Living feature checkboxes: `docs/scope/scope.md`.

## 1. Locked decisions (do not reopen casually)

- **ICP**: physical product sellers, founders launching a product, developers/builders. Not casual “anyone who posts.”
- **Review before publish**: new users start in review mode; autonomy only after trust.
- **Model decides, code executes**: Thesean/Claude/GPT via tool calling; product validates; SocialMCP publishes.
- **Profile / memory**: Postgres structured categories (business profile, rules, skills, memory), not one opaque blob and not fine tuning.
- **Repo split**: this SaaS repo owns users, profiles, orchestration, review UI; SocialMCP (external) owns OAuth tokens, adapters, worker, execution DB.
- **Hosting reality (2026-08-07)**: Neon Postgres; Fly `sochestral` + `sochestral-api`; cloud SocialMCP; Cloudflare R2 wired for private media.
- **Pricing (paid launch; free beta now)**: Starter $15 / ₦15,000 · Pro $30 / ₦30,000 · Agency $65 / ₦65,000; image caps 30 / 60 / 100; Nigeria Paystack · global Paddle; country/currency chosen at signup.
- **Beta policy**: free access for the beta cohort. Tier gates may exist in product code. Billing is not a beta invite gate.

## 2. Current Build Status

Reconciled to Linear on 2026-08-07.

| Item | Status | Notes |
|------|--------|-------|
| Tracer Bullet path on product URL | **Done** | provision → connect → chat → draft → preview aside → approve → SocialMCP publish → live result |
| Feature 4 chat + connectors | **Done** | SOC-5, SOC-18 |
| Feature 5 review publish loop | **Done** | SOC-6, SOC-19 |
| Feature 14 live platform preview aside | **Done** | SOC-7 |
| Feature 12 publishing authority + images | **In Progress** | R2 wired in cloud; live smoke then enable `PUBLISHING_AUTHORITY_ENABLED` (SOC-9) |
| Feature 13 intent clarify + Thinking UI | **In Progress** | Clarify path in use; `THESEAN_THINKING_ENABLED` / Thinking smoke (SOC-8) |
| Docs / AGENTS / scope sync to Neon + cloud | **In Progress** | SOC-20 |
| Slice 2 (tiers, setup agent, channels, calendar) | **Not started** | Blocked on clean Slice 1/12 close out |
| Monetization (Paystack + Paddle) | **Parallel** | Not a free beta gate |

**Product URL:** `https://app.sochestral.shop`  
**API:** `https://api.sochestral.shop`  
**Primary DB:** Neon (via `DATABASE_URL` on `sochestral-api`)

## 3. Close out order

1. SOC-20: sync docs / AGENTS / scope (this file + `docs/scope/scope.md` + `AGENTS.md`)
2. SOC-9: Feature 12 live smoke + enable authority flag
3. SOC-8: Feature 13 Thinking flag smoke
4. Then Slice 2 design starts at Feature 6 (tier model / free beta entitlements)

## 4. Explicit non goals for early phases

- No custom or fine tuned model
- No full autonomy before review mode has proven content quality
- No new platforms before SocialMCP has a stable adapter
- No casual consumer positioning
