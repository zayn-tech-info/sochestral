# Rationale for 0006. Configurable publishing authority and image uploads

## Context

> ⚠️ Premise note: Publishing authority and image storage are separate subsystems, but the user flow binds them at the composer, review set, immutable attempt, and live execution boundary. This spec keeps one cross system contract while the build plan delivers small end to end slices. SocialMCP changes remain an external coordinated dependency, not product code copied into this repository.

Spec 0005 establishes explicit review as the only live authority and keeps model tools in preview mode. Users now need a stable account wide approval preference, while preserving the same tenant ownership, validation, rate, idempotency, and recovery guarantees.

Image posts also need owned storage. Passing local browser files or long lived public object URLs through model and publish paths would expose storage details and make retry snapshots unstable. The product needs one owned media identity that survives chat, review, publishing, and deletion.

The rollout spans the product database, Hono API, orchestration, Thesean model input, web UI, Cloudflare R2, and the external SocialMCP connector contract. Automatic authority must remain disabled until the coordinated path is proven.

## Options considered

### Option 1: Extend trusted review with feature flagged authority and private R2 assets

Keep review groups and publish attempts as the execution foundation. Store an account preference and immutable run snapshot, then use private owned assets with temporary signed URLs.

**Pros**:

- Preserves the proven safety and idempotency boundary.
- Supports deterministic retries and conversation deletion.
- Allows gradual rollout and immediate rollback to Always draft.

**Cons**:

- Adds schema, storage, cleanup, and coordinated deployment work.

### Option 2: Let the model choose whether to publish and pass browser image URLs

Prompt the model with the selected mode and let it call a live tool. Upload images to directly readable URLs.

**Pros**:

- Requires less product side orchestration.

**Cons**:

- Model output becomes an authority boundary.
- Public or long lived media URLs weaken ownership and deletion controls.
- Duplicate, ambiguous, and adversarial prompts are harder to make safe.

### Option 3: Keep manual review only and defer uploads

Retain spec 0005 unchanged until later autonomy and media projects.

**Pros**:

- Has the smallest immediate operational cost.

**Cons**:

- Does not deliver the requested approval modes or image post workflow.
- Forces another migration through the same chat and review contracts later.

## Rationale

Option 1 is the only choice that changes user convenience without changing who is trusted to execute. The local intent resolver and immutable authority snapshot are product policy. The existing review service remains the live safety boundary. This makes Full access narrowly mean immediate publishing to owned connected accounts after blocking checks pass.

Private R2 assets give the product a stable owned reference. Signed URLs become disposable transport details for previews, model input, and SocialMCP. Additive tables, dual writes, and a rollout flag reduce migration risk while the external `connectedAt` contract is coordinated.
