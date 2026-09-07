# 0015 rationale: Image generation and editing

## Context

> Premise note: Full billing and the cross product credit usage dashboard are not in this slice. This feature assumes a beta env credit budget and stub Add credit / Upgrade copy until Feature 6 and a later usage surface land. Those assumptions are explicit constraints, not silent gaps. Remove background and upscale were desired in the first edit pack but OpenAI `gpt-image-2` does not cover them cleanly, so they wait rather than bolting a second vendor in the same Tracer Bullet.

Sochestral already uploads, sanitizes, and publishes owned images (Feature 12, spec 0006). What is missing is generation and guided editing so sellers, founders, and builders can get publish ready visuals without leaving the operator loop.

Image APIs are expensive and easy to abuse with an eager chat agent. The product must be effective for the user (branded flyers when wanted, random subject shots when not) and safe for the business (confirm before spend, monthly cap, kill switch, durable cost fields).

Not deciding now would either block visual posts on manual uploads only, or invite an ad hoc provider call from the model with no budget control.

## Options considered

### Option 1: Higgsfield as sole image backend

One vendor with generate plus dedicated remove background, reframe, and upscale, plus live cost preflight.

**Pros**:
- Edit tools map cleanly to the first edit pack
- Cost preflight before confirm

**Cons**:
- Extra vendor and auth surface
- You preferred to supply an OpenAI key and standardize on `gpt-image-2`

### Option 2: OpenAI `gpt-image-2` only (chosen)

Single Images API for generate, vary, and prompt edit. Local `sharp` crop for reframe when the source is large enough. Interface stays swappable.

**Pros**:
- One key you control
- Strong prompt following and text in image for flyers
- Fits confirm before spend with a product price table

**Cons**:
- No native remove background or upscale in this slice
- Unit cost may exceed cheaper Flux hosts
- Reframe is crop first, not generative expand

### Option 3: fal.ai or Replicate multi model

Wide model menu and often lower raw generate prices.

**Pros**:
- Cost and quality knobs per model

**Cons**:
- Easy for the agent or code to pick expensive models
- Edit ops become a glue layer across models
- More ops surface than a Tracer Bullet needs

### Option 4: Generate with no confirm click

User wording alone spends against a quota.

**Pros**:
- Fewer taps

**Cons**:
- One chat loop can burn many images
- Harder to show size and cost before money leaves

## Rationale

Option 2 wins because you already chose `gpt-image-2` and an API key, and the product already has R2 media. The confirm strip, monthly credit budget, one in flight job, and allowlisted kinds are what keep admin loss bounded before real billing. Brand Assets plus clarify based opt in keep generation effective without branding every random shoe image.

Postgres backed jobs avoid standing up Redis for the first path. Feature 12 remains the only publish binary path so schedule and review do not fork.

Runner up was Higgsfield (Option 1) for edit completeness. Revisit if remove background and upscale become blocking, or if `gpt-image-2` margin hurts.
