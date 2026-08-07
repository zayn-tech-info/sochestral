# Feature 12 Test Coverage and Gaps

**Feature**: Configurable Publishing Authority and Image Uploads  
**Updated**: 2026-08-07

## Current Test Coverage

### ✅ Unit Tests Passing

#### Publishing Intent Classification (`packages/orchestration/src/publishing.test.ts`)
- ✅ Local draft intent veto (draft wording, questions, negation)
- ✅ Explicit live intent detection
- ✅ Intent classification with LLM
- ✅ Unclear intent handling
- ✅ Fail-closed behavior on errors

#### Media Storage (`packages/api/src/media-storage.test.ts`)
- ✅ Image sanitization (EXIF removal)
- ✅ MIME spoofing detection
- ✅ Ownership checks (masks foreign assets)
- ✅ Upload quota enforcement (hourly limit)

#### API Routes (`packages/api/src/orchestration-routes.test.ts`, `review-routes.test.ts`)
- ✅ Route authentication
- ✅ Basic request/response contracts

## Test Gaps

### 🔴 High Priority - Integration Tests (Post-Smoke)

These should be written after successful live smoke test:

1. **End-to-End Image Publish Flow**
   - Upload → attach to message → draft with vision → review → publish
   - Requires: Mock SocialMCP HTTP MCP, mock Thesean vision
   - File: `packages/api/src/publishing-integration.test.ts` (new)

2. **Authority Mode Matrix**
   - Always draft: never auto-publishes
   - Approve for me: auto-publishes on explicit live intent only
   - Full access: auto-publishes with warnings, blocks on errors
   - Requires: Mock SocialMCP publish, mock intent classifier
   - File: `packages/orchestration/src/authority.test.ts` (new)

3. **Vision Fallback**
   - Vision enabled, model supports images: images sent as content blocks
   - Vision enabled, model fails: fallback to text-only, no invented details
   - Vision disabled: text-only path
   - Requires: Mock Thesean with vision failure scenarios
   - File: `packages/orchestration/src/vision.test.ts` (new)

### 🟡 Medium Priority - Database Integration Tests

1. **Publishing Preference Lifecycle**
   - Default to always_draft
   - Mode transitions with consent
   - Expired consent handling
   - Concurrent preference changes during active run (snapshot immutability)
   - File: `packages/database/src/publishing.test.ts` (new)

2. **Media Asset Lifecycle**
   - Pending → ready → attached → conversation delete → R2 cleanup
   - Pending expiry (24 hour cleanup)
   - Storage quota enforcement
   - File: `packages/database/src/media.test.ts` (new)

### 🟢 Low Priority - Edge Cases

1. **Connector Freshness (`connectedAt`)**
   - Multiple accounts for same platform: newest `connectedAt` selected
   - Tie-breaking on same timestamp (stable account ID ordering)
   - Missing `connectedAt` (error handling)
   - Requires: Mock SocialMCP with multiple accounts
   - File: `packages/orchestration/src/connectors.test.ts` (enhance existing)

2. **Publish Result Handling**
   - Full success → "Published social set"
   - Full failure → "Social set needs attention"
   - Partial success → "Social set needs attention"
   - Unknown state → "Social set needs attention"
   - File: `packages/orchestration/src/review.test.ts` (enhance existing)

## Manual Test Requirements

The following MUST be tested manually (cannot be automated without significant mocking):

### Critical Manual Tests (verify.md smoke test)
- [ ] Upload real image to R2 (cloud storage integration)
- [ ] Publish to real Threads/Instagram account (live platform integration)
- [ ] Vision model processes image correctly (Thesean integration)
- [ ] Consent dialog flow in web UI (GUI interaction)
- [ ] Mode selector in Settings (GUI interaction)
- [ ] Image preview in composer and review aside (GUI interaction)
- [ ] Launcher label updates based on publish outcome (GUI state)

### Optional Manual Tests
- [ ] Reduced motion behavior for mode transitions
- [ ] Mobile responsive behavior for image upload
- [ ] Keyboard navigation for consent dialog
- [ ] Screen reader accessibility for mode controls

## Running Existing Tests

```bash
# All packages
pnpm test

# Specific packages
pnpm run test:database
pnpm run test:auth
pnpm run test:api
pnpm run test:orchestration

# Watch mode for TDD
pnpm --filter @sochestral/orchestration test --watch
```

## Test Environment Setup

```bash
# Local test database
export TEST_DATABASE_URL=postgresql://sochestral:sochestral@localhost:5433/sochestral_test

# Run migrations for test DB
DATABASE_URL=$TEST_DATABASE_URL pnpm run db:migrate

# Run tests
pnpm test
```

## Known Test Issues

### Database Tests (orchestration.test.ts)
**Status**: 4 tests failing with "column 'live_intent_kind' does not exist"

**Cause**: Tests reference outdated column name that was refactored to `explicit_live_intent`

**Fix**: Update test assertions to use correct column name

**Priority**: Medium (does not block Feature 12 smoke test)

## Test Coverage Goals

| Area | Current | Target | Priority |
|------|---------|--------|----------|
| Publishing intent | 95% | 95% | ✅ |
| Media storage | 85% | 95% | 🟡 |
| Authority modes | 30% | 80% | 🔴 |
| Vision integration | 0% | 70% | 🔴 |
| Database publishing | 0% | 80% | 🟡 |
| End-to-end flow | 0% | 60% | 🔴 |

## Test Writing Guidelines

When writing new tests for Feature 12:

1. **Mock external services**: SocialMCP HTTP MCP, Thesean API, R2 storage
2. **Use test database**: Always use `TEST_DATABASE_URL`, clean up in afterEach
3. **Test ownership**: Every test should verify owner-scoped queries
4. **Test security**: Verify foreign asset rejection, masked not-found responses
5. **Test idempotency**: Duplicate requests should be safe
6. **Test fail-closed**: Errors should never grant authority or expose data

## Post-Smoke Test Action Plan

After live smoke test passes:

1. **Write authority mode integration tests** (high priority)
   - Mock SocialMCP publish responses
   - Test all three modes with various intent wordings
   - Verify launcher labels update correctly

2. **Write vision fallback tests** (high priority)
   - Mock Thesean with vision success/failure
   - Verify image content blocks sent correctly
   - Verify fallback to text-only on failure

3. **Write end-to-end flow test** (high priority)
   - Upload → attach → draft → review → publish
   - Use in-memory mock for R2, mock SocialMCP, mock Thesean
   - Verify media URLs are signed and time-limited

4. **Fix failing orchestration tests** (medium priority)
   - Update column references from `live_intent_kind` to `explicit_live_intent`

5. **Enhance database publishing tests** (medium priority)
   - Preference lifecycle with consent
   - Authority event audit log
   - Snapshot immutability

6. **Run `/test` skill** to generate remaining test skeletons

## References

- **Spec**: [docs/specs/0006-publishing-authority-images/index.md](../../specs/0006-publishing-authority-images/index.md)
- **Verify checklist**: [docs/specs/0006-publishing-authority-images/verify.md](verify.md)
- **Critical test scenarios** (from spec): AC-1 through AC-15 test matrix
