# 0009 Rationale: Setup agent and business profile

## Context

> Premise note: Master plan section 3.4 describes four markdown style context files. Scope Feature 7 requires categorized Postgres, not one blob. This spec treats those file names as conceptual labels only. Literal files on disk would create a second source of truth and fight settings edit. Feature 6 (tiers) is still undesigned; Feature 7 does not wait on billing gates. Feature 12 already owns publishing authority; this feature must not invent a second mode system.

New users can chat and publish today without a durable business profile. The operator model then guesses tone, audience, and competitors from a short thread. Scope Feature 7 asks for a separate setup agent that turns plain language onboarding into structured profile data, and for that data to drive generation. Slice 1 deferred profile tables on purpose (see spec 0001). Slice 2 now needs the thinnest real path: persist categories, force enough onboarding to be useful, let the user see and fix what was stored, and inject the result into operator turns.

Forces in play: Tracer Bullet (prove one path through database, API, orchestration, and web), the existing chat and `intent_questions` carousel, Thesean model routing already used for vision and chat, and a planned DeepSeek key for search that is not wired yet. Not deciding leaves the product without a "knows my business" story and leaves Feature 11 and channels without a profile to attach rules to.

## Options considered

### Option 1: Categorized Postgres profile plus forced setup agent (chosen)

One `business_profiles` row per user plus many `profile_entries` by closed category. Global setup gate on `setup_status`. Setup uses a stronger Thesean model. Research uses a product owned DeepSeek step with user confirm. Settings edits the same rows. Operator turns compile active data into a note at read time.

**Pros**:
- Matches scope "not one opaque document" and settings visibility
- Queryable categories; compile gives the model a readable note without a second store
- Reuses chat routes and Q&A carousel

**Cons**:
- More schema and orchestration branching than a single JSON document
- DeepSeek and opus add cost and new failure modes

### Option 2: Single JSON or markdown document per user

Store one blob (or four markdown strings) and treat settings as a text editor.

**Pros**:
- Simple table shape
- Feels like the master plan file metaphor

**Cons**:
- Categories are not queryable
- Conflicts and buried rules return (the problem categorized storage was meant to solve)
- Harder for trusted code to enforce closed categories and statuses

### Option 3: Settings form only, no setup agent

Ship identity fields and entry CRUD; skip forced chat onboarding and research.

**Pros**:
- Smaller orchestration change
- No DeepSeek dependency

**Cons**:
- Misses the OpenClaw style force identify path the product wants
- Tone from abstract form fields is weaker than sample post correction
- Competitors stay manual only

### Option 4: Soft nudge without a hard gate

Always allow operator chat; show a banner until the profile is filled.

**Pros**:
- No lockout friction

**Cons**:
- Many users never complete a useful profile
- Operator quality stays weak for the users who need it most

## Rationale

Option 1 wins because the job is durable, editable, category safe context for every generation, not a cheaper schema. Closed categories plus entry status give settings and research confirm a clear lifecycle. Compiling at read time avoids a stale denormalized note column. A global gate (not per conversation) matches real user behavior: people open new chats mid onboarding. DeepSeek stays a product owned step so the setup model never gets an open web tool, and missing keys fail open so Feature 7 can ship before the secret exists. Feature 11 and Feature 12 boundaries stay explicit so this feature does not rebuild correction memory or publishing authority.
