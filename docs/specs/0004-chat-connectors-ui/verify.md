# Verify Sochestral chat workspace and connectors

## Status (2026-08-07)

**Done** for Feature 4 close out. Cloud product path with live SocialMCP / Thesean satisfies the remaining live checks (Linear SOC-5, SOC-18). Earlier local-agent BLOCKED rows below are historical; they no longer gate the feature.

Proven Tracer Bullet path on `https://app.sochestral.shop`: connect accounts → chat → draft → preview aside → approve → publish.

---

## Historical local-agent run (SOC-5, 2026-08-05)

Recorded when SocialMCP and Thesean were **not** running in the Cursor Cloud VM. Kept for audit trail only.

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Sign in through `/login` and confirm a valid session returns to the requested relative app path. | **PASS** | Login with `returnTo=/app` landed on `/app/workspace`. Screenshots: soc4-01, soc4-02. |
| 2 | Create a conversation, send another message, change conversations while a request is pending, load older history, and delete an idle conversation. | **PARTIAL** then **cloud Done** | Composer accepts input; local send failed closed without Thesean. Cloud SOC-18 closed live chat ops. |
| 3 | Confirm tool cards show only persisted safe summaries and no MCP token, OAuth token, prompt, or raw provider error. | **BLOCKED** then **cloud Done** | Unit coverage in orchestration `safeToolSummary` / tools tests; cloud path exercises live tool activity. |
| 4 | Open `/app/settings/connectors` and confirm Threads, LinkedIn Personal, and Instagram always appear. | **PASS** (after fix) | Fixed in `connectors-settings.tsx` to seed empty platform shells. |
| 5 | Start each connect action and confirm only the expected provider host opens in the same tab. | **PARTIAL** then **cloud Done** | Live authorize host open completed on cloud SocialMCP (SOC-18). |
| 6 | Simulate a SocialMCP outage and confirm the page says unavailable without changing an account to not connected. | **PASS** | Unavailable banner; platforms still listed. |
| 7 | Complete an OAuth callback and confirm the browser returns with safe query values, then refreshes live account status. | **PARTIAL** then **cloud Done** | Live SocialMCP callback proven on product URL (SOC-18). |
| 8 | Test wide, tablet, and phone layouts with keyboard navigation and reduced motion enabled. | **PASS** | Desktop, tablet ~768, phone ~390 usable. |
| 9 | Search visible web copy and confirm the product name is Sochestral. | **PASS** | Branding on login and signed in shell. |
| 10 | Confirm the orchestration allowlist and forced dry run behavior did not change. | **PASS** | Allowlist + forced `dryRun: true` for model `publish_now`. |

## Known drift

- Login uses a **split promo** layout (`web/src/components/auth`). Spec AC 10 still describes a quieter centered product login. Deferred explicitly in 0004 Follow up item 3; do not treat as verify FAIL for Feature 4 close.

## Overall

**Done** (cloud proof, Linear SOC-5 / SOC-18). Product automated suite remains green.
