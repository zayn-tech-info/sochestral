# Rationale for 0007. Intent clarify and Thinking UI

## Context

Full access users expected slangy confirmations such as “Just shot it there” to publish. The product instead fail closed to non live intent and still ran `prepare_review`, creating another draft. Specs 0003 and 0004 also forbade exposing model reasoning, while the approved product direction asks for a Claude like Thinking disclosure with both safe step labels and real model thinking.

## Options considered

### Option 1: Ternary intent plus streamed steps and thinking

Product owned `live` | `draft` | `unclear`, clarify on unclear, NDJSON steps, Thesean thinking behind a flag.

**Pros**: Matches the approved UX; keeps publish authority product owned; reuses the platform clarify pattern.
**Cons**: Amends the prior no reasoning stream rule; depends on Thesean thinking support.

### Option 2: Only loosen the classifier prompt

Keep boolean intent and hope slang maps to live.

**Pros**: Small code change.
**Cons**: Still drafts on classifier false; no thinking UI; fragile phrase chasing.

### Option 3: Chat model asks clarify without product gate

Rely on the system prompt to ask instead of `prepare_review`.

**Pros**: Soft UX.
**Cons**: Fights the current prepare_review prompt; model can still draft; weakens the authority boundary.

## Rationale

Option 1 is the only design that stops silent drafts on ambiguity, preserves trusted publish execution, and delivers the Thinking UI the product asked for. Safe steps are always available; real thinking is opt in behind `THESEAN_THINKING_ENABLED` so production can stay dark until smoke checks pass.

## References

**Project sources**:
- Specs 0003, 0004, 0006
- Approved plan Clarify intent and Thinking UI

**Practices**:
- Fail closed authority with explicit clarify rather than silent side effects
- Progressive disclosure for model internals
