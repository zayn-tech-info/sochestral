# Verify review mode publish loop

## Automated proof

1. Apply the product migration to a fresh test database and prove legacy drafts survive with empty ordered media.
2. Run product database, orchestration, API, auth, and web tests sequentially with the isolated test database.
3. Run SocialMCP database, MCP server, adapter, and shared contract tests on Node 22 with provider calls mocked.
4. Run product and SocialMCP type checks, lint, and production builds.

## Product behavior

1. Ask for a Threads draft, confirm one inline review set appears, edit it, save it, and approve it.
2. Confirm chat text and model tool calls cannot publish without the button.
3. Confirm the only connected account is selected automatically and multiple accounts require a selection.
4. Confirm an invalid Instagram draft remains editable and disables the whole group action.
5. Confirm a duplicate click replays the same approval and does not create another platform post.
6. Confirm partial success leaves successful cards read only and retry includes only failed cards.
7. Confirm an unknown card is locked and Check status never creates another platform call.
8. Refresh and reopen the conversation. Confirm every draft and latest attempt is restored.
9. Confirm conversation deletion cascades idle review data and is blocked during a publishing attempt.

## Security and accessibility

1. Confirm another tenant receives masked not found responses for edit, publish, and check.
2. Confirm missing or foreign Origin, wrong content type, and missing `X-Sochestral-Request` are rejected.
3. Confirm responses and structured logs omit tokens, raw payloads, post body, media URLs, and internal errors.
4. Use keyboard only to edit media ordering, choose accounts, save, approve, retry, and check status.
5. Confirm visible focus, semantic labels, polite status announcements, mobile layout, and reduced motion behavior.

## Manual live proof

Publish one harmless approved test post to Threads, LinkedIn Personal, and Instagram. Confirm failed preflight, stale revisions, duplicate actions, and status checks produce no extra live posts.
