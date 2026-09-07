# 0016 rationale

## Context

Feature 17 stores Brand Assets and can send them to `gpt-image-2` after confirm. Thesean does not scan that gallery on each generate ask. That saves tokens, but it also means the chat agent has no durable sense of flyer layout, logo placement, or style. Feeding the whole library into every chat turn would burn vision tokens. Text only colors are cheap and weak. The product needs one compile when assets change, then cheap reuse.

## Options considered

### Option 1: Cached Thesean vision brief plus logo and 1 or 2 exemplars

Compile once on library change. Chat reads text. Generate sends a small image pack.

**Pros**: Best fidelity versus cost. Reuses Thesean vision.

**Cons**: Compile latency after uploads. Auto pick may miss a favorite sample.

### Option 2: Text brief from colors and notes only

No vision compile.

**Pros**: Cheapest.

**Cons**: Weak style match for flyers.

### Option 3: Attach the full gallery on every generate

**Pros**: Strong visual match.

**Cons**: High token and image API cost. Muddy prompts.

## Rationale

Option 1 matches the locked Q and A: auto rebuild, opt in still required, product picks exemplars, Thesean vision once.

## References

- Spec 0015 image generation and editing
- Thesean vision path already used for chat attachments (`THESEAN_VISION_MODEL`)
