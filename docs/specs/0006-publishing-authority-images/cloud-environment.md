# Cloud Environment Configuration for Feature 12

**Updated**: 2026-08-07  
**Feature**: Configurable Publishing Authority and Image Uploads  
**Target**: Fly.io production (`sochestral-api` app)

## Overview

Feature 12 requires specific environment variables to be set in the cloud (Fly.io) production environment before live smoke testing can proceed. This document tracks the required configuration and current status.

## Required Environment Variables

### R2 Storage Configuration (CRITICAL)

**Status**: ✅ Provisioned (per Linear SOC-9)

These must be set in `sochestral-api` Fly.io secrets:

```bash
R2_ENDPOINT=<cloudflare-r2-endpoint>
R2_REGION=auto
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET=<bucket-name>
```

**How to verify**:
```bash
fly secrets list -a sochestral-api
```

Should show:
- `R2_ENDPOINT`
- `R2_REGION`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

**R2 Bucket Setup** (already done per issue):
- Private bucket (not public)
- CORS configured for upload from `https://app.sochestral.shop`
- Lifecycle rules for cleanup (optional but recommended)

### Publishing Authority Rollout Flag

**Status**: ⏸️ Must be `false` initially, enable after smoke passes

```bash
PUBLISHING_AUTHORITY_ENABLED=false  # Initial state
PUBLISHING_CONSENT_VERSION=2026-08-01
```

**How to set**:
```bash
fly secrets set PUBLISHING_AUTHORITY_ENABLED=false -a sochestral-api
fly secrets set PUBLISHING_CONSENT_VERSION=2026-08-01 -a sochestral-api
```

**After smoke test passes**:
```bash
fly secrets set PUBLISHING_AUTHORITY_ENABLED=true -a sochestral-api
fly apps restart sochestral-api
```

### Vision Configuration

**Status**: ✅ Product default — Luna for image turns; Sonnet for text

Image-bearing turns use `ship-like/gpt-5.6-luna` via Thesean's OpenAI-compatible API (`https://api.thesean.ai/v1`). Text-only turns keep `ship-like/claude-sonnet-5` (`THESEAN_MODEL`).

`THESEAN_VISION_ENABLED` is an **opt-out kill switch**: unset or any value other than the string `false` attaches real image bytes. Only `THESEAN_VISION_ENABLED=false` disables vision (text stubs).

```bash
# Default product behavior (vision on)
THESEAN_VISION_ENABLED=true
THESEAN_VISION_MODEL=ship-like/gpt-5.6-luna
THESEAN_MODEL=ship-like/claude-sonnet-5
THESEAN_INTENT_MODEL=ship-like/claude-sonnet-5  # Optional, defaults to THESEAN_MODEL
```

**Kill switch** (emergency only):
```bash
fly secrets set THESEAN_VISION_ENABLED=false -a sochestral-api
fly apps restart sochestral-api
```

Pending live smoke on the product URL before treating Luna as fully locked vs Gemini Flash / Claude vision bakeoff.

### Media Upload Limits (Optional - have defaults)

These have sensible defaults in the code, but can be tuned:

```bash
MEDIA_UPLOAD_TICKET_TTL_SECONDS=600
MEDIA_PREVIEW_TTL_SECONDS=3600
MEDIA_PUBLISH_TTL_SECONDS=7200
MEDIA_PENDING_TTL_HOURS=24
MEDIA_UPLOAD_HOURLY_LIMIT=50
MEDIA_USER_STORAGE_LIMIT_BYTES=1073741824  # 1 GB
```

## External Dependencies

### SocialMCP Service

**Required**:
- HTTP MCP server running and accessible
- `connectedAt` field populated for all connected accounts
- OAuth flow working for Threads, LinkedIn, Instagram

**Environment variables in `sochestral-api`**:
```bash
SOCIALMCP_MCP_URL=<http-mcp-endpoint>
```

**How to verify SocialMCP readiness**:
1. Check `connectedAt` is populated in SocialMCP DB for user accounts
2. Test MCP HTTP endpoint responds: `curl $SOCIALMCP_MCP_URL/health`

### Thesean LLM Service

**Required**:
```bash
THESEAN_API_KEY=<thesean-api-key>
```

**How to verify**:
1. Test API key is valid and has quota
2. Confirm configured model supports vision if `THESEAN_VISION_ENABLED=true`

## Verification Steps Before Smoke Test

Run these checks before starting Feature 12 live smoke:

### 1. Verify R2 is provisioned

```bash
fly secrets list -a sochestral-api | grep R2
```

Expected: All five R2 vars present (ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET)

### 2. Verify publishing flag is disabled

```bash
fly secrets list -a sochestral-api | grep PUBLISHING_AUTHORITY
```

Expected: `PUBLISHING_AUTHORITY_ENABLED` is `false` or absent (defaults to false)

### 3. Verify vision state

```bash
fly secrets list -a sochestral-api | grep VISION
```

Expected: `THESEAN_VISION_ENABLED` unset or `true` (product default); only `false` disables. `THESEAN_VISION_MODEL` defaults to `ship-like/gpt-5.6-luna`.

### 4. Verify external dependencies

```bash
# Check SocialMCP
fly secrets list -a sochestral-api | grep SOCIALMCP

# Check Thesean
fly secrets list -a sochestral-api | grep THESEAN
```

Expected: Both `SOCIALMCP_MCP_URL` and `THESEAN_API_KEY` are set

### 5. Test API health

```bash
curl https://api.sochestral.shop/health
```

Expected: HTTP 200 OK

## Setting Secrets

### Interactive method

```bash
fly secrets set KEY=VALUE -a sochestral-api
```

This will prompt for the value securely.

### Batch method

```bash
cat <<EOF | fly secrets import -a sochestral-api
R2_ENDPOINT=https://...
R2_REGION=auto
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
PUBLISHING_AUTHORITY_ENABLED=false
PUBLISHING_CONSENT_VERSION=2026-08-01
THESEAN_VISION_ENABLED=true
THESEAN_VISION_MODEL=ship-like/gpt-5.6-luna
EOF
```

### Restart after secrets change

```bash
fly apps restart sochestral-api
```

Wait 30-60 seconds for app to restart and health check to pass.

## Rollback Plan

If smoke test fails, immediately disable authority flag:

```bash
fly secrets set PUBLISHING_AUTHORITY_ENABLED=false -a sochestral-api
fly apps restart sochestral-api
```

R2 configuration remains in place for retry. Do not remove R2 secrets unless deprovisioning entirely.

## Security Notes

- R2 credentials are sensitive - never commit to git
- All secrets managed via Fly.io encrypted secrets
- Bucket is private - only signed URLs are public (time-limited)
- Preview URLs expire after `MEDIA_PREVIEW_TTL_SECONDS`
- Publish URLs expire after `MEDIA_PUBLISH_TTL_SECONDS`

## Monitoring

After enabling `PUBLISHING_AUTHORITY_ENABLED=true`, monitor:

1. **R2 storage usage**: Check Cloudflare R2 dashboard for bucket size
2. **Upload rate**: Monitor `MEDIA_UPLOAD_HOURLY_LIMIT` hit rate
3. **Publish success rate**: Check SocialMCP publish logs
4. **Vision API usage**: Monitor Thesean API usage if vision enabled

## References

- **Linear issue**: SOC-9 (CRITICAL: Feature 12 live smoke + enable PUBLISHING_AUTHORITY_ENABLED)
- **Spec**: [docs/specs/0006-publishing-authority-images/index.md](../../specs/0006-publishing-authority-images/index.md)
- **Verify checklist**: [docs/specs/0006-publishing-authority-images/verify.md](../../specs/0006-publishing-authority-images/verify.md)
- **Smoke test guide**: [docs/specs/0006-publishing-authority-images/smoke-test-guide.md](../../specs/0006-publishing-authority-images/smoke-test-guide.md)
- **Fly.io docs**: https://fly.io/docs/reference/secrets/
- **R2 docs**: https://developers.cloudflare.com/r2/
