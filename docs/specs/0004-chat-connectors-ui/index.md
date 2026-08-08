# 0004. Sochestral chat workspace and connectors

**Date**: 2026-07-26
**Status**: Accepted

## Summary

This feature creates the first signed in Sochestral workspace. It combines the existing orchestration conversation path with a quiet light interface, progressively rendered assistant responses, and a Settings area where users connect social accounts. SocialMCP remains the owner of OAuth sessions, encrypted tokens, and connected account truth.

## Requirements

**User stories**:

1. As a signed in user, I want to talk to Sochestral in a familiar chat workspace so I can inspect accounts, validate content, and request safe publish previews.
2. As a signed in user, I want to connect and review my social accounts in Settings so I know which channels Sochestral can use.
3. As a returning user, I want to continue or delete past conversations so my workspace remains useful over time.

**Acceptance criteria**:

1. **AC 1**: A valid product session opens `/app` and can create, list, switch, continue, paginate, and delete owned conversations through the existing orchestration API.
2. **AC 2**: The chat composer accepts text up to the existing 8000 character limit. Enter sends, Shift Enter adds a line, the user message appears immediately, and the assistant response is rendered progressively in server order while the request remains pending.
3. **AC 3**: Safe tool activity is collapsed beneath the assistant response for the request that caused it. Review launchers appear in that same request section. A request that used no tool and created no review group shows no activity control. Activity never moves to a newer request and never exposes tool arguments, MCP tokens, OAuth tokens, raw provider errors, or hidden prompts. Sanitized model thinking and product owned step labels are allowed only under [0007](../0007-intent-clarify-thinking-ui/index.md).
4. **AC 4**: `/app/settings/connectors` shows Threads, LinkedIn Personal, and Instagram with all public connected accounts and one of `not_connected`, `connected`, or `reconnect_required`.
5. **AC 5**: A user can start or restart OAuth for each supported platform. The product API calls SocialMCP with a tenant JWT, returns only a validated provider authorization URL, and the browser opens it in the same tab.
6. **AC 6**: Connector status refreshes on page load, window focus, OAuth return, and manual refresh. A SocialMCP failure is shown as unavailable and is never interpreted as disconnected.
7. **AC 7**: SocialMCP OAuth callbacks return to the configured product connector page with only a platform, a safe result, and a stable error code. The product then reloads connector status.
8. **AC 8**: An invalid or expired product session redirects to `/login` with a relative return path. Successful login returns the user to that safe path.
9. **AC 9**: The workspace uses a light responsive layout with a compact 248 pixel left navigation and one centered content area. It has no contextual right rail. On small screens chat stays primary and navigation opens in an accessible sheet.
10. **AC 10**: Visible web product copy uses the name Sochestral. The signed in workspace and login use Inter, compact type, warm neutral surfaces, subtle borders, and muted violet accents. They avoid decorative gradients, glows, large icon containers, and unnecessary AI marks. Hover, press, navigation, disclosure, loading, and content changes use polished motion no longer than 300 milliseconds. Reduced motion removes transforms, springs, and staggered entrances.
11. **AC 11**: This feature cannot approve, schedule, or publish live. The existing orchestration allowlist and forced dry run rule remain unchanged.
12. **AC 12**: Streaming chat creates one temporary assistant response, appends ordered text without artificial typing delays, shows only safe validated tool status, handles retry and nonterminal tool step resets without duplicate text, and replaces transient state with the canonical terminal response. Auto scroll follows only while the user remains near the bottom. Reduced motion and assistive announcements preserve progressive content without announcing every token.

## Decision

**Chosen option**: First product experience with narrow connector APIs

Build a real authenticated chat workspace now, and place OAuth account management under Settings. Use direct credentialed browser requests to the Hono product API. The browser never calls SocialMCP and never receives an MCP JWT.

## Feature design

### Product surfaces

| Route | Purpose | Main states |
|---|---|---|
| `/login` | Product sign in | ready, submitting, invalid credentials, API unavailable |
| `/app` | New chat and recent conversations | empty, loading, working, API failure |
| `/app/chat/[conversationId]` | Owned conversation | loading, ready, working, older history, not found, failed |
| `/app/settings/connectors` | Social account management | loading, connected, not connected, reconnect required, service unavailable, OAuth result |

The wide layout has a compact 248 pixel left navigation rail and one centered content area. Full connector state, guidance, and management appear only in Settings. Feature 5 review cards may show eligible public account identity and a required destination selector as a narrow publishing exception. There is no contextual right rail or context sheet. Mobile keeps chat visible and moves navigation into an accessible sheet.

The empty chat uses a modest greeting, one text composer, and three compact suggestion pills. It does not use a large hero card, decorative AI mark, or duplicate new chat action. Existing conversations use a readable 760 pixel transcript column. Each assistant message owns a small request section containing only its safe tool disclosure and review launchers. Empty request sections render nothing. Sending inserts the user message immediately and opens one temporary assistant response. Text deltas are batched to browser animation frames for clean rendering, partial Markdown remains readable, and the terminal event replaces transient data with the canonical persisted response. Auto scroll stays pinned while the viewport is within 96 pixels of the transcript bottom and never pulls a reader away from older content. While pinned, animation frame updates keep the bottom aligned without a separate animation for every token. A conversation can remain pending while the user views another conversation. Deletion uses an accessible confirmation and is blocked while that conversation has an active request.

Settings uses compact connector rows with platform identity, public account information, connection state, and the relevant connect action. The login route uses a centered form rather than a split promotional layout. Existing authentication and connector behavior remain unchanged.

### Visual system

The signed in workspace and login use a scoped light product theme so the existing dark marketing site remains unchanged. The product theme uses a warm gray page, white surfaces, dark neutral text, subtle gray borders, and muted violet only for focus and important state. Inter is used throughout these product surfaces. Headings are no larger than 28 pixels, body text stays between 14 and 16 pixels, and component radii stay between 8 and 12 pixels except true pills.

Product motion uses one shared Motion configuration. Hover and press transitions take 140 to 180 milliseconds. Content entrances take 180 to 260 milliseconds with no more than six pixels of travel. Mobile navigation uses a restrained spring. Active primary navigation has a shared moving indicator. Messages, working state, errors, OAuth banners, connector rows, login content, and tool disclosure animate only when their state changes. Looping motion is limited to progress feedback. All motion follows the user reduced motion preference.

### Data model sketch

No new product tables are added.

1. Product users and sessions come from spec 0002.
2. Conversations, messages, runs, and tool summaries come from spec 0003.
3. Connected account records and OAuth sessions stay in SocialMCP and are selected by the same product user id carried in JWT `sub`.
4. The browser stores only the preferred navigation layout in local storage.

### State transitions

Connector display state is derived from SocialMCP account rows.

`not_connected` becomes `connected` after successful OAuth.

`connected` becomes `reconnect_required` when SocialMCP reports that account status.

An unavailable status request produces `unavailable`. It does not replace the last known account state with `not_connected`.

### API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/connectors` | GET | none | connectors, accounts | product session | 401, 502 |
| `/connectors/:platform/connect` | POST | platform path | platform, authorizeUrl, expiresAt | product session | 401, 422, 502 |
| `/orchestration/conversations` | GET, POST | existing cursor, limit, message, requestId | existing conversation contracts plus nullable turn activity | product session | existing spec 0003 errors |
| `/orchestration/conversations/stream` | POST | message, requestId | ordered safe NDJSON turn events | product session | terminal safe stream event |
| `/orchestration/conversations/:id` | GET, DELETE | existing id, cursor, limit | messages plus request scoped turn activities, or delete result | product session and ownership | existing spec 0003 errors |
| `/orchestration/conversations/:id/messages` | POST | existing message, requestId | existing turn contract | product session and ownership | existing spec 0003 errors |
| `/orchestration/conversations/:id/messages/stream` | POST | message, requestId | ordered safe NDJSON turn events | product session and ownership | terminal safe stream event |

`GET /connectors` returns this public shape:

```ts
type ConnectorPlatform = "threads" | "linkedin_personal" | "instagram";
type ConnectorState = "not_connected" | "connected" | "reconnect_required";

type ConnectorSummary = {
  platform: ConnectorPlatform;
  state: ConnectorState;
  accounts: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    state: "connected" | "reconnect_required";
  }>;
};
```

`POST /connectors/:platform/connect` returns:

```ts
type ConnectStart = {
  platform: ConnectorPlatform;
  authorizeUrl: string;
  expiresAt: string;
};
```

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| Check session | user id and email | product session through `GET /auth/me` |
| List conversations | title, id, timestamps, cursor | existing product orchestration rows |
| Show transcript | messages, run state, safe tool activity | existing orchestration conversation response |
| Send a message | message | composer input |
| Make retry safe | requestId | browser generated UUID, reused only after an uncertain network result |
| Render progressive response | ordered delta and step id | safe NDJSON events from the product API |
| Show progressive tool state | public name and status | validated safe stream event, then persisted tool summary |
| Finalize the turn | canonical messages, tools, and review groups | terminal stream response backed by persisted orchestration state |
| Place request activity | assistant message id | request scoped turn activity from the product API |
| Place review launcher | review groups | owned public groups nested in that request scoped turn activity |
| Follow new content | pinned or unpinned state | browser scroll position near the transcript bottom |
| Show connector status | platform and account identity | sanitized `list_connected_accounts` SocialMCP tool result |
| Start OAuth | authorize URL and expiry | sanitized `connect_account` SocialMCP tool result |
| Select connector state | connected or reconnect required | public SocialMCP account status |
| Select not connected | no account rows for a supported platform | successful SocialMCP list result only |
| Show OAuth result | platform, safe result, stable code | fixed SocialMCP callback redirect query |
| Show product theme | product name, Inter type, neutral surfaces, and violet accent | this spec and scoped web product theme |
| Select motion behavior | timing, easing, travel, and spring response | this spec and the shared product Motion configuration |
| Select reduced motion | whether transforms, springs, and staggered entrances run | browser `prefers-reduced-motion` through Motion and CSS |

### Key invariants

1. The browser never receives MCP tokens, OAuth tokens, raw SocialMCP records, hidden prompts, or unredacted tool results.
2. Connector calls use the signed in product user id only. Request input cannot choose another user.
3. The model tool allowlist remains `list_connected_accounts`, `validate_post`, and dry run `publish_now`. `connect_account` is never exposed to the model.
4. The product validates the platform path and the returned OAuth host before returning an authorization URL.
5. Conversation navigation does not cancel another conversation request.
6. An explicit retry after a confirmed terminal response gets a new request id. A retry after an uncertain network result reuses the original request id.
7. Product interaction remains responsive. Normal motion never exceeds 300 milliseconds and never delays navigation, form submission, or API requests.
8. Stream events are applied only in monotonically increasing sequence. Unknown, duplicate, malformed, or oversized frames do not become rendered content.
9. Partial assistant text is temporary and never replaces the canonical terminal conversation state.
10. Navigation or stream loss does not start a second turn. Recovery reuses the uncertain request id through the existing orchestration contract.
11. Tool disclosures and review launchers render only inside their matching assistant message section.
12. A request with no tool summaries and no review groups renders no activity element.

### Security model

Every product route requires the existing HttpOnly session cookie. The server derives tenant identity from that session and mints the short lived SocialMCP JWT internally. Connector output is allowlisted to public account identity and state. Return paths must be relative product paths. OAuth redirect query values are a fixed platform, safe result, and stable code.

Allowed authorization hosts are fixed per platform:

1. Threads uses `threads.net`.
2. LinkedIn Personal uses `www.linkedin.com`.
3. Instagram uses `www.facebook.com`.

### Configuration required

1. `NEXT_PUBLIC_API_URL`: product API origin used by the web app.
2. `PRODUCT_OAUTH_RETURN_URL`: absolute product connector page used by SocialMCP callback redirects.
3. Existing `SOCIALMCP_MCP_URL`, `JWT_SECRET`, platform OAuth credentials, and platform redirect values remain required by their owning services.

### Critical test scenarios

1. Happy path: sign in, create a chat, receive a safe response, open Settings, start OAuth, return, and see a connected account, verifies **AC 1**, **AC 4**, **AC 5**, **AC 7**, and **AC 8**.
2. Failure case: SocialMCP connector listing fails and the UI reports unavailable without showing accounts as disconnected, verifies **AC 6**.
3. Auth case: an anonymous or expired session cannot read conversations or connectors and returns to login, verifies **AC 8**.
4. Safety case: connector responses and tool cards contain no token or raw error fields, and chat cannot publish live, verifies **AC 3** and **AC 11**.
5. Accessibility case: keyboard chat submission, confirmation dialog, mobile navigation sheet, visible focus, and reduced motion all work, verifies **AC 2**, **AC 9**, and **AC 10**.
6. Visual structure case: ordinary chat performs no connector request, an inline feature 5 review may request only eligible destination accounts, no right rail appears at any breakpoint, and full connector state remains available in Settings, verifies **AC 4**, **AC 9**, and **AC 10**.
7. Motion case: hover, press, active navigation, page entrance, message arrival, tool disclosure, transient banners, login entrance, and mobile sheet exit animate smoothly without layout shift, verifies **AC 9** and **AC 10**.
8. Reduced motion case: browser reduced motion removes transforms, springs, staggered entrances, and nonessential looping motion while preserving every state change, verifies **AC 10**.
9. Progressive response case: fragmented Markdown appears in order, the temporary assistant response is reconciled with the persisted terminal response, and rapid chunks do not cause duplicate text or layout jitter, verifies **AC 2** and **AC 12**.
10. Retry and recovery case: a provider step reset removes only uncommitted text, a disconnected response does not start a duplicate run, and an uncertain retry uses the same request id, verifies **AC 1** and **AC 12**.
11. Scroll and accessibility case: new content follows only near the bottom, manual upward scrolling remains stable, working and final status are announced without token by token noise, and reduced motion preserves progressive text, verifies **AC 9**, **AC 10**, and **AC 12**.
12. Request activity case: one request validates content, one creates a review, and one answers without tools. Each activity control and review launcher appears only below its own assistant response, and the plain answer has none, verifies **AC 1** and **AC 3**.
13. Activity pagination case: older history merges request activity by assistant message id without moving or duplicating newer controls, verifies **AC 1** and **AC 3**.

## Build plan

1. [x] Add the tenant scoped connector gateway and the two authenticated product endpoints with sanitized schemas, host validation, and API tests, satisfies **AC 4**, **AC 5**, **AC 6**, and **AC 11**.
2. [x] Add the authenticated workspace shell, conversation client, new chat flow, history, safe tool cards, deletion, session recovery, and responsive navigation, satisfies **AC 1**, **AC 2**, **AC 3**, **AC 8**, **AC 9**, and **AC 11**.
3. [x] Add the connectors settings page with account states, connect and reconnect actions, OAuth result banners, refresh triggers, and unavailable handling, satisfies **AC 4**, **AC 5**, **AC 6**, **AC 7**, **AC 8**, and **AC 9**.
4. [x] Redesign login, correct visible product naming, add Sora and Motion, and verify responsive, accessible, reduced motion behavior, satisfies **AC 8**, **AC 9**, and **AC 10**.
5. [x] Add the fixed SocialMCP callback return behavior while preserving JSON callbacks when the return URL is not configured, satisfies **AC 7**.
6. [x] Replace the busy dark shell, chat empty state, connector cards, and split login with the approved compact light product theme while preserving all current behavior, satisfies **AC 1**, **AC 2**, **AC 3**, **AC 4**, **AC 6**, **AC 8**, **AC 9**, **AC 10**, and **AC 11**.
7. [x] Add the shared product motion system, animated interaction states, accessible disclosure and sheet exits, reduced motion behavior, and reliable development startup, satisfies **AC 1**, **AC 2**, **AC 3**, **AC 4**, **AC 6**, **AC 8**, **AC 9**, **AC 10**, and **AC 11**.
8. [ ] Add the ordered NDJSON response client, temporary assistant state, animation frame batching, retry reset, terminal reconciliation, safe scroll following, accessible announcements, and reduced motion behavior, satisfies **AC 1**, **AC 2**, **AC 3**, **AC 9**, **AC 10**, and **AC 12**.
9. [ ] Render tool disclosures and review launchers from request scoped turn activity, merge paginated activity by assistant message id, and remove conversation wide activity rendering, satisfies **AC 1**, **AC 3**, **AC 9**, and **AC 12**.

## Consequences

**Positive**:

1. The product proves the first useful signed in experience through real backend paths.
2. OAuth token ownership stays entirely in SocialMCP.
3. Chat and account connection are ready before approval and live publishing are introduced.

**Negative and tradeoffs**:

1. The web app depends on the product API and SocialMCP both being reachable.
2. Direct browser requests require correct credentialed CORS configuration.
3. The signed in product is light only in this release. A second product theme is deferred.
4. Progressive delivery adds transient client state and recovery logic even though final persistence remains unchanged.
5. The web client carries a small request activity map so controls remain attached through pagination and refresh.

**Neutral**:

1. No product database migration is needed.
2. Approval, scheduling, profile, analytics, and live publishing remain later scope features.
3. The existing dark marketing site remains outside this product redesign.

## Follow up

1. [x] Run `/check verify Sochestral chat workspace and connectors UI` (partial: see verify.md; SocialMCP live steps still blocked).
2. [x] Run `/test Sochestral chat workspace and connectors UI` (unit suite already present; connectors unavailable platforms regression added).
3. [ ] Amend or replace the split promo login (`web/src/components/auth`) so AC 10 quiet login holds, or revise AC 10 deliberately under a design pass. Until then treat promo chrome as known drift.
4. [ ] Finish verify.md steps that need a live SocialMCP + Thesean (tool cards, real OAuth host open, live callback).

## Rationale

The decision record is in [rationale.md](rationale.md).
