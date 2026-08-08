# Feature 12 Verification: Configurable Publishing Authority and Image Uploads

**Feature**: [0006 - Configurable Publishing Authority and Image Uploads](./index.md)  
**Status**: In Progress  
**Last Updated**: 2026-08-07

## Pre-flight: Environment Prerequisites

Before running verification, confirm the following environment configuration is in place:

### Required Cloud Environment Variables (Fly.io Production)

Check these are set in `sochestral-api` app secrets:

```bash
# R2 Storage (CRITICAL - must be provisioned before smoke test)
R2_ENDPOINT=<cloudflare-r2-endpoint>
R2_REGION=auto
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret>
R2_BUCKET=<bucket-name>

# Publishing Authority (starts disabled, enable ONLY after smoke passes)
PUBLISHING_AUTHORITY_ENABLED=false  # MUST be false initially
PUBLISHING_CONSENT_VERSION=2026-08-01

# Vision (enable after confirming Thesean vision route works)
THESEAN_VISION_ENABLED=false  # Enable for vision smoke, or leave false for text-only path
THESEAN_MODEL=ship-like/claude-sonnet-5  # or configured model
THESEAN_INTENT_MODEL=ship-like/claude-sonnet-5  # optional, defaults to THESEAN_MODEL

# External dependencies (must be running)
SOCIALMCP_MCP_URL=<socialmcp-http-mcp-url>  # HTTP MCP endpoint
THESEAN_API_KEY=<thesean-api-key>
```

### SocialMCP External Dependency

Verify the external SocialMCP service (separate repo) has:
- `connectedAt` field populated for connected accounts (AC-6 requirement)
- HTTP MCP server running at `SOCIALMCP_MCP_URL`
- OAuth flow working for Threads, LinkedIn, Instagram

### Local Development Environment

For local verification before cloud smoke:

```bash
cp .env.example .env
# Fill in local R2 credentials (can use same cloud R2 bucket or separate test bucket)
pnpm install
pnpm run db:migrate
pnpm run db:provision <test-email>
pnpm run db:set-password <test-email> <password>
```

## Acceptance Criteria Verification Matrix

| AC | Area | Status | Verification Method | Evidence |
|----|------|--------|-------------------|----------|
| AC-1 | Preference defaults and mutations | ⏸️ | Unit tests + manual Settings flow | `publishing.test.ts`, Settings UI smoke |
| AC-2 | Full access consent flow | ⏸️ | Unit tests + manual consent dialog | Settings consent dialog smoke |
| AC-3 | Authority snapshot immutability | ⏸️ | Unit tests + manual preference change during run | Orchestration tests |
| AC-4 | Intent safety (draft/live/unclear) | ✅ | Unit tests passing | `publishing.test.ts` veto + classifier tests |
| AC-5 | Mode-specific automatic publish | ⏸️ | Manual smoke per mode | Smoke test matrix below |
| AC-6 | Trusted review service + `connectedAt` | ⏸️ | Manual smoke + SocialMCP coordination | Verify newest account selected |
| AC-7 | Launcher labels | ⏸️ | Manual UI smoke | Review launcher rendering |
| AC-8 | Upload ticket issuance | ✅ | Unit tests passing | `media-storage.test.ts` |
| AC-9 | Upload sanitization | ✅ | Unit tests passing | MIME spoofing, metadata removal tests |
| AC-10 | Message media attachment | ⏸️ | Manual chat flow | Send message with image |
| AC-11 | Asset expiry and cleanup | ⏸️ | Manual + cleanup script | Pending asset expiry test |
| AC-12 | Review draft media editing | ⏸️ | Manual review flow | Edit images in review aside |
| AC-13 | Composer and Settings UI | ⏸️ | Manual UI smoke | Paperclip, mode selector, consent dialog |
| AC-14 | Vision integration | ⏸️ | Manual smoke with vision-enabled message | Image sent to Thesean, fallback on failure |
| AC-15 | Rollout flag | ⏸️ | Manual feature flag toggle | Verify selector disabled when flag=false |

**Legend:**
- ✅ Verified (tests passing or smoke complete)
- ⏸️ Pending verification (needs manual smoke or additional tests)
- ❌ Failing (needs fix)

## Critical Smoke Test: Live Image Publish Flow

**Goal**: Prove one complete path from private image upload → attach to chat → vision (optional) → review → publish to real social account.

**Prerequisites**:
- Production environment (`https://app.sochestral.shop` or equivalent product URL)
- Real user account with at least one connected platform (Threads or Instagram preferred for image support)
- `PUBLISHING_AUTHORITY_ENABLED=false` initially (forced Always draft mode)
- R2 fully wired and credentials set
- `THESEAN_VISION_ENABLED` decision made (true for vision path, false for text-only)

### Smoke Test Procedure

#### Phase 1: Upload and Attach (Always Draft Mode)

1. **Login** to product URL with test account
2. **Navigate** to Settings → verify all three publishing modes are disabled/hidden (flag=false forces Always draft)
3. **Open chat workspace**
4. **Upload private image**:
   - Click paperclip/attach button in composer
   - Select test image (JPEG, PNG, or WebP, < 10 MB)
   - Confirm thumbnail renders
   - Confirm upload completes (ready state)
5. **Send message** with image attached:
   - Type: "Create a post about this product for Threads"
   - Confirm message sends with image visible
   - Confirm orchestration run starts
6. **Verify agent response**:
   - If `THESEAN_VISION_ENABLED=true`: Agent should describe the image in its draft
   - If `THESEAN_VISION_ENABLED=false`: Agent should acknowledge the image as "an attached image" without inventing details
7. **Verify draft opens in review aside**:
   - Review aside auto-opens (AC-7 launcher)
   - Draft shows as "Review social set" launcher
   - Image preview visible in aside
   - Can edit caption text in place
   - Can select connected account (dropdown)
8. **Approve and publish**:
   - Click "Approve" button
   - Publish executes through SocialMCP
   - Wait for publish result
9. **Verify publish result**:
   - Launcher updates to "Published social set" on success (AC-7)
   - Aside shows "Live" state with live preview
   - Check actual platform (Threads/Instagram) for published post with image
   - Verify image is publicly accessible in published post

**Expected result**: Image uploaded → attached → drafted → reviewed → published to real platform successfully, with image rendering correctly on the live platform.

#### Phase 2: Connector Freshness (`connectedAt`)

1. **Before smoke**: Check SocialMCP database for user's connected accounts, note `connectedAt` timestamps
2. **During smoke**: If user has multiple accounts for same platform, verify newest `connectedAt` is selected (AC-6)
3. **After smoke**: Confirm the correct account was used for publish

#### Phase 3: Enable Publishing Authority

**Only proceed to this phase after Phase 1 passes completely.**

1. **Set cloud env**: `fly secrets set PUBLISHING_AUTHORITY_ENABLED=true -a sochestral-api`
2. **Restart API**: `fly apps restart sochestral-api` (or wait for auto-restart)
3. **Verify Settings unlock**:
   - Navigate to Settings
   - Confirm all three modes now visible: Always draft, Approve for me, Full access
   - Current mode should be "Always draft" (default)

#### Phase 4: Approve for Me Mode

1. **Switch to Approve for me**:
   - Settings → change mode to "Approve for me"
   - Confirm preference saves
2. **Test automatic publish with explicit live intent**:
   - New chat message: "Publish this announcement to Threads: We're launching our new product line next week!"
   - Agent should detect explicit live intent (AC-4 classifier)
   - Should NOT open review aside
   - Should publish automatically (AC-5, AC-6)
   - Launcher shows "Published social set" (AC-7)
3. **Test draft fallback with ambiguous intent**:
   - New message: "Yeah, the product launch post"
   - Should open review aside (unclear intent, AC-4)
   - Should NOT auto-publish

#### Phase 5: Full Access Mode

1. **Switch to Full access**:
   - Settings → attempt "Full access"
   - **Confirm consent dialog appears** (AC-2, AC-13)
   - Must acknowledge warning and provide consent version
   - Confirm mode switches after consent
2. **Test automatic publish with warnings**:
   - Message: "Post this update to LinkedIn: Excited to share our Q3 results"
   - Should publish automatically even with warnings (AC-5)
   - Should NOT publish if blocking errors occur (AC-5)

#### Phase 6: Vision Fallback (if `THESEAN_VISION_ENABLED=true`)

1. **Send message with image but simulate vision failure**:
   - Temporarily misconfigure vision model (or use a model without vision)
   - Send message with image
   - Verify orchestration falls back to text-only path (AC-14)
   - Agent should NOT invent visual details
   - Verify image is still publishable despite vision failure

## Mode-Specific Test Matrix

| Mode | Intent | Has image? | Blocking error? | Expected outcome | Launcher label | Verified? |
|------|--------|-----------|----------------|-----------------|----------------|-----------|
| Always draft | Any | No | N/A | Opens review | "Review social set" | ⏸️ |
| Always draft | Any | Yes | N/A | Opens review | "Review social set" | ⏸️ |
| Approve for me | Draft wording | No | N/A | Opens review | "Review social set" | ⏸️ |
| Approve for me | Explicit live | No | No | Auto-publishes | "Published social set" | ⏸️ |
| Approve for me | Explicit live | Yes | No | Auto-publishes | "Published social set" | ⏸️ |
| Approve for me | Unclear | No | N/A | Asks clarify question | (no launcher yet) | ⏸️ |
| Approve for me | Explicit live | No | Yes (blocker) | Opens review | "Social set needs attention" | ⏸️ |
| Full access | Explicit live | No | No | Auto-publishes | "Published social set" | ⏸️ |
| Full access | Explicit live | No | Yes (warning) | Auto-publishes | "Published social set" | ⏸️ |
| Full access | Explicit live | No | Yes (blocker) | Opens review | "Social set needs attention" | ⏸️ |

## Edge Cases and Error Scenarios

### Media Edge Cases
- [ ] Upload while at hourly quota limit (should reject with 429)
- [ ] Upload while at storage limit (should reject with 413)
- [ ] Upload spoofed MIME type (should reject after byte read with 415)
- [ ] Upload animated/multipage image (should reject with 415)
- [ ] Upload >40 megapixel image (should reject with 422)
- [ ] Attach foreign asset ID (should reject with 404)
- [ ] Attach pending/incomplete asset (should reject with 409)
- [ ] Delete conversation with attached assets (should clean R2 first)

### Authority Edge Cases
- [ ] Expired consent version (effective mode falls back to Always draft, AC-2)
- [ ] Concurrent preference changes during active run (run uses snapshot, AC-3)
- [ ] Platform clarify turn (never calls intent classifier, always opens review)
- [ ] Missing connected account for requested platform (opens review with error)
- [ ] Partial publish (some platforms succeed, some fail) (launcher: "Social set needs attention")

### Vision Edge Cases
- [ ] Vision enabled but model doesn't support images (fallback to text-only, AC-14)
- [ ] Vision timeout or API error (fallback to text-only, AC-14)
- [ ] Message with 6+ images (only newest 5 sent to model per AC-14)

## Rollback Criteria

**Immediately rollback (set `PUBLISHING_AUTHORITY_ENABLED=false`) if:**
- Image upload fails consistently with R2 errors
- Published posts are missing images on live platforms
- Wrong account is selected for publish (newest `connectedAt` not respected)
- Automatic publish executes under Always draft mode
- Full access mode publishes without valid consent
- Vision failure causes orchestration to crash (instead of text-only fallback)

## Sign-off

**Automated tests**: ✅ Passing (intent classification, media storage, API routes)  
**Manual smoke tests**: ⏸️ Pending coordinated smoke on production URL  
**SocialMCP coordination**: ⏸️ Verify `connectedAt` populated and respected  
**Cloud environment**: ⏸️ Confirm R2 provisioned and credentials set  
**Rollout flag**: ⏸️ Currently `false`, enable only after smoke passes  

**Smoke test date**: _______________  
**Tester**: _______________  
**Outcome**: _______________  
**Cloud agent reference**: _______________  

## Next Steps After Verification

1. ✅ All smoke tests pass → Enable `PUBLISHING_AUTHORITY_ENABLED=true` in production
2. Run `/test` to write any missing automated tests for gaps
3. Run `/sync` to update scope.md with Feature 12 verification complete
4. Close SOC-9 Linear issue
5. Move Feature 12 to "done" status in scope

## References

- **Spec**: [0006-publishing-authority-images/index.md](./index.md)
- **Rationale**: [0006-publishing-authority-images/rationale.md](./rationale.md)
- **Scope progress**: [docs/scope/scope.md](../../scope/scope.md)
- **Linear issue**: SOC-9 (CRITICAL: Feature 12 live smoke + enable PUBLISHING_AUTHORITY_ENABLED)
