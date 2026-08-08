# Verify intent clarify and Thinking UI

## Status (2026-08-08)

**Partial (operator gated).** Intent clarify that blocks silent drafts is part of the working cloud chat path (Tracer Bullet proven). Automated Thinking / stream close out tests for SOC-8 are landed in repo. Feature 13 is **not** fully closed until cloud `THESEAN_THINKING_ENABLED` is recorded after product URL smoke (or an intentional delay is recorded).

Tracked on Linear **SOC-8**. Build contract: `docs/specs/SOC-8-spec.md`.

| Area | Result | Notes |
|------|--------|-------|
| Ternary intent + unclear clarify turn | **Done (cloud path)** | Unclear intent asks instead of inventing a draft; no silent `prepare_review` for unclear |
| NDJSON stream + safe step labels | **Built + tested** | Stream client and Thinking disclosure ship in web; API NDJSON route tests cover event lines |
| Automated Thinking / flag / model / disclosure tests | **Done (repo)** | Config true + budget, model thinking payload + HTTP 400 fallback, orchestration stream flag on/off, `apiStreamTurn` thinking deltas, Thinking unavailable copy |
| `THESEAN_THINKING_ENABLED` extended reasoning on cloud | **Open (operator)** | Confirm Fly `sochestral-api` secret after Thesean smoke, or document intentional delay with evidence |
| Formal `/check verify` on product URL | **Open** | Checker / operator smoke: ambiguous clarify turn + clear draft turn |

## Operator checklist (SOC-8)

1. Confirm the Thesean account supports extended thinking for the Sonnet route used by `sochestral-api`.
2. Smoke on `https://app.sochestral.shop`: one Approve for me / Full access ambiguous intent turn (clarify, no silent draft) and one clear draft turn.
3. If draft smoke shows Thinking body (or stream `thinking_delta` / persisted `thinkingText`): set Fly secret `THESEAN_THINKING_ENABLED=true` on `sochestral-api`, redeploy or refresh secrets, then recheck the disclosure.
4. If smoke cannot pass for a provider or account reason: leave the flag false and record intentional delay evidence on SOC-8 and in this file (status Delayed).
5. Do not store secrets in the repo.

## Overall

Do not mark Feature 13 Done until SOC-8 records the cloud flag outcome (enabled after smoke, or Delayed with reason) and formal verify passes. Intent clarify alone is not the remaining risk.
