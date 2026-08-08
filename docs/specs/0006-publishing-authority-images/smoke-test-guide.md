# Feature 12 Live Smoke Test - Quick Execution Guide

**Target**: Production environment at `https://app.sochestral.shop`  
**SocialMCP External Dependency**: Must be running and accessible  
**Time estimate**: 30-45 minutes for complete smoke test

## Pre-flight Checklist

- [ ] Cloud env has R2 vars set (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`)
- [ ] `PUBLISHING_AUTHORITY_ENABLED=false` (will enable after smoke)
- [ ] `THESEAN_VISION_ENABLED` decision made (recommend `true` for GPT-5.6 Luna via Thesean)
- [ ] Test account has at least one connected social account (Threads or Instagram preferred)
- [ ] SocialMCP has `connectedAt` populated for accounts

## Quick Smoke Procedure

### 1. Image Upload & Draft (Always Draft Mode)

```
1. Login → app.sochestral.shop
2. Settings → verify modes hidden (flag=false)
3. Chat → click paperclip → upload test image
4. Message: "Create a post about this product for Threads"
5. ✓ Agent drafts with image context (vision) or generic acknowledgement (no vision)
6. ✓ Review aside opens automatically
7. ✓ Image preview visible
8. ✓ Can edit caption
9. Approve → wait for publish
10. ✓ Launcher: "Published social set"
11. ✓ Check Threads/Instagram - image published correctly
```

**STOP** if this fails. Fix before proceeding.

### 2. Verify `connectedAt` Selection

```
1. Check SocialMCP DB: note newest `connectedAt` account
2. From Phase 1: verify that account was used for publish
3. ✓ Newest account selected (AC-6)
```

### 3. Enable Authority Flag

```
fly secrets set PUBLISHING_AUTHORITY_ENABLED=true -a sochestral-api
fly apps restart sochestral-api
```

Wait 30 seconds for restart.

### 4. Approve For Me Mode

```
1. Settings → change to "Approve for me"
2. Chat → "Publish this announcement to Threads: Launching our new product next week!"
3. ✓ No review aside opens
4. ✓ Auto-publishes
5. ✓ Launcher: "Published social set"
6. ✓ Post visible on Threads

7. Chat → "Yeah, that sounds good" (ambiguous)
8. ✓ Review aside opens (unclear intent)
```

### 5. Full Access Mode

```
1. Settings → switch to "Full access"
2. ✓ Consent dialog appears
3. Accept consent
4. Chat → "Post this to LinkedIn: Excited to share our Q3 results"
5. ✓ Auto-publishes
6. ✓ Post visible on LinkedIn
```

### 6. Vision Fallback (if vision enabled)

```
1. Chat with image: "Draft a post about this"
2. If vision works: ✓ Agent describes image content
3. If vision fails: ✓ Agent says "attached image" without details, post still publishable
```

## Pass Criteria

✅ **All checks pass**:
- Image uploaded and sanitized
- Vision path works (or text-only fallback safe)
- Draft opens with image preview
- Manual publish succeeds with image on platform
- Newest `connectedAt` account selected
- Approve for me auto-publishes with clear intent
- Full access consent flow works
- No R2 errors, no publish failures

## Rollback

❌ **If any check fails**:
```
fly secrets set PUBLISHING_AUTHORITY_ENABLED=false -a sochestral-api
fly apps restart sochestral-api
```

Document failure, fix, re-test.

## After Smoke Passes

1. Leave `PUBLISHING_AUTHORITY_ENABLED=true` in production
2. Run `/test` for remaining test gaps
3. Run `/sync` to update scope
4. Close Linear SOC-9
5. Mark Feature 12 "done" in scope

## Troubleshooting

**Image upload fails**: Check R2 credentials, verify bucket exists  
**Publish fails**: Check SocialMCP logs, verify `connectedAt` populated  
**Vision fails**: Check `THESEAN_VISION_ENABLED` and Thesean model config  
**Wrong account used**: SocialMCP not respecting `connectedAt`, coordinate fix  
**Mode selector not appearing**: `PUBLISHING_AUTHORITY_ENABLED` still false or not restarted
