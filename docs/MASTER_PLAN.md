# Sochestral — Master Plan

## 1. Product Definition

**Sochestral** is a business-strict AI social operator. It acts as a social
media manager for people who sell or ship something real and need steady
online presence. The product is plain language first: users never see code,
client IDs, or configuration files. They talk to the agent; the agent drafts
content, schedules it, publishes it, and later can manage
replies/comments/mentions, learning from corrections over time.

### Who this is for (ICP)

1. **Physical product sellers** — need consistent posts to stay relevant and
   win more customers without running a separate marketing stack alone.
2. **Founders launching a product** — need a reliable cadence of launch and
   progress updates without becoming full time social media operators.
3. **Developers and builders** — want to be seen while they build; they
   refuse to get stuck only shipping code with no public signal.

The ICP includes technical people. “Plain language” means no platform
credentials or ops busywork in the UI, not “non technical users only.”

### Product bar

Business-strict and professionally implemented. Prefer better practice
defaults: official platform APIs, validated tool execution (model decides,
code executes), review-before-publish safety, clear tenant boundaries, and
serious operator tone over playful chatbot chrome.

### What this product is not (v1 scope guard)

- Not for casual consumers or “anyone who posts.” Real business, launch, or
  builder presence stakes are required.
- Not a "manage every platform" product on day one. Threads + LinkedIn +
  Instagram first; Facebook and others later when adapters exist.
- Not a fully autonomous system on day one. New users start in
  review-before-publish mode and graduate to autonomous mode once the agent
  has a track record with their account.
- Not a custom-trained model. The reasoning layer is Claude/GPT (Thesean)
  with tool use, function calling, and per-user structured memory — no
  fine-tuning.

The existing SocialMCP MCP server is the execution layer this product calls
as an external dependency. This plan covers everything above that layer: the
SaaS product, multi-tenant product data, the onboarding agent, orchestration,
memory, and the GUI.

---



## 2. Core Architecture

```
User (chat UI, plain language; seller / founder / builder)
   │
   ▼
Orchestration Backend (Node/Express or Next.js API routes)
   │
   ├─► Postgres — user accounts, business profiles, memory/rules memory/skill,
   │              content history, scheduled posts and maybe more
   ├─► Redis + BullMQ — job queue: scheduled posts, webhook processing,
   │              async video/image generation
   ├─► LLM (Claude/GPT, function calling) — decision layer only,
   │              never executes code directly
   ├─► SocialMCP tool layer — the actual action functions
   │              (create_post, schedule_post, reply_to_comment, etc.)
   ├─► Platform APIs — Threads, LinkedIn (Instagram/Facebook later)
   │              via per-user OAuth tokens, not shared credentials
   └─► Generation APIs — Runway/HeyGen/Pika (video), Ideogram/Flux (image) or any other capable models that would be used, called async via job queue, results stored in R2/S3
```



### Key principle: the LLM decides, the code executes

The model never generates and runs arbitrary code. It is given a fixed set of tools (the MCP tool layer) and returns structured decisions ("call schedule_post with these args"). The backend validates and executes. This is a security requirement, not just a design preference — letting a model-generated action run unvalidated against a real social account is how a bad output becomes a real published mistake.

---



## 3. Multi-Tenancy (prerequisite — shipped in SocialMCP)

SocialMCP multi tenant identity is already shipped in the external MCP
repo. Product callers authenticate with `Authorization: Bearer` JWT
(`sub` = SaaS `users.id`). Do not rebuild MCP token storage or adapters
here.

Product side still owns:

- Postgres users, sessions, orchestration, review drafts, publishing
  prefs, and media metadata
- Minting short lived MCP JWTs for the signed in tenant
- Never storing platform OAuth tokens in the product database

---



## 4. The Onboarding Agent (separate from the operator agent)

Two distinct agent roles:

1. **Setup agent** — runs once (and re-runs when the user wants to update
  their profile). Its only job is turning a plain-language conversation into
  a structured profile. Sellers, founders, and builders describe their
  business or product, voice, rules, and skills conversationally; the setup
  agent extracts and writes structured data.
2. **Operator agent** — runs on every trigger (cron, webhook, user message).
  Reads the structured profile + memory, decides actions, calls tools.



### What the setup agent captures

- Business description (free text, in the user's own words)
- Voice/tone — captured by generating 3 sample posts and having the user
correct them, faster and more reliable than asking abstract questions
like "describe your tone"
- Explicit do-not rules (competitors, banned topics, banned words and whatever is the user's prefrence)
- Posting cadence preference
- Platform connections (OAuth, one click per platform)
- Approval mode: review-before-publish (default for new users) vs full autonomous (unlocked after a trust threshold), meaning the agent as to work over time before the user can be allow to switch to autonomus mode. we can provide a progress bar of 100% that show the trust level and once it's hits 100% they get notified if they want to switch to autonomus mode and if they don't approval mode is also fine



### Output: a structured profile object

Stored in Postgres, not as a single blob — structured by category so rules
don't silently conflict or get buried as they grow:

- `tone_rules`
- `Skills`
- `content_type_rules`
- `do_not_mention`
- `posting_cadence`
- `approval_mode`
- `platform_connections`
- `and more (they get created base on what user wants, the agent understands the intent a name it as the categories it falls, e.g don't do X -> (agent understand intent, name proceed to naming) "memory/rules")`

---



## 5. Self-Correcting Memory (the "learns from mistakes" requirement)

This is structured memory with a write-back loop, not fine-tuning.
Fine-tuning per user is too slow and expensive to react to a single
correction ("don't use that style") — memory updates should be instant.

### The loop

1. **Feedback capture** — when the user corrects the agent ("don't use
  emojis," "always mention the founder's name in launch posts"), that
   correction is parsed into a discrete rule, not left buried in raw
   chat history.
2. **Write-back** — the agent updates its own stored profile with that
  rule. Newer corrections override older conflicting rules.
3. **Retrieval on every generation** — every content-generation call pulls
  the current full rule set for that user into context.
4. **Pre-publish self-check** — before anything goes live, a lightweight
  review pass checks new output against stored rules. Storing a rule
   isn't enough; the agent needs to actively check against it before
   publishing, not just "remember" it exists.



### Risk to design around

Unchecked self-editing memory can drift or contradict itself over months
of corrections. Categorized storage (tone, content-type, do-not-mention,
cadence) rather than a flat growing list prevents old rules from being
silently buried or conflicting with new ones.

---



## 6. Request Flow (end to end example)

```
User: "Post something about our new product launch this week"
   → Backend loads business profile + rules from Postgres
   → LLM (with tools: generate_video, generate_image, write_caption,
     schedule_post, post_now) decides the plan
   → If video needed: job queued to Runway/HeyGen (async, minutes)
   → Job completes → asset stored in R2 → linked to post record
   → Pre-publish self-check against stored rules
   → Agent presents draft to user (review mode) or auto-publishes
     (autonomous mode, once trust threshold reached)
   → On publish: SocialMCP tool layer → platform API via stored
     per-user OAuth token
   → Result logged in publish_logs; any user correction feeds back
     into memory
```

---



## 7. Trigger Sources

- **Cron/scheduled jobs** — deterministic, no AI needed to trigger,
checks what's due to post
- **Webhooks from platforms** — comment/mention received → triggers an
agent run to decide how to respond
- **Direct user messages** — "post about X today"

---



## 8. What Needs Scaling, and When

Don't over-build early:

- Single Postgres instance + one Redis queue is sufficient at low user
counts
- The slow/expensive parts (LLM calls, video generation) are naturally
rate-limited by third-party APIs, not your infra
- Worker pool scaling only becomes a real concern once webhook volume or
scheduled job volume reaches thousands/hour across all users

---



## 9. Build Order (sequenced, not simultaneous)

Living detail and checkboxes live in `docs/scope/scope.md`. This section
is the coarse sequence against real progress.

### Shipped in this SaaS repo (matches Linear, 2026-08-07)

1. Product Postgres on **Neon** + migrations (`packages/database`)
2. Auth sessions + MCP JWT minting (`packages/auth`, API `/auth/*`, login)
3. Orchestration backend + Thesean tool loop (`packages/orchestration`)
4. Chat workspace + Settings connectors (Feature 4 **Done**; SOC-5 / SOC-18)
5. Review mode publish loop for Threads, LinkedIn Personal, Instagram
   (Feature 5 **Done**; SOC-6 / SOC-19) via cloud SocialMCP
6. Live platform preview aside replacing the review modal
   (Feature 14 **Done**; SOC-7)
7. Publishing authority + private image upload path (Feature 12 code present;
   **R2 wired** in cloud; `PUBLISHING_AUTHORITY_ENABLED` still false until
   live smoke — SOC-9)
8. Intent clarify + Thinking / NDJSON stream (Feature 13 build complete;
   Thinking / `THESEAN_THINKING_ENABLED` flag smoke still open — SOC-8)

Tracer Bullet path proven on `https://app.sochestral.shop` with Fly apps
`sochestral` + `sochestral-api` and cloud SocialMCP.

### Close out before Slice 2

1. Feature 12 live smoke on product URL (image attach → approve → publish),
   then enable `PUBLISHING_AUTHORITY_ENABLED` (SOC-9)
2. Feature 13 Thinking flag / Thesean extended reasoning smoke + verify
   (SOC-8)
3. Free beta invites can proceed without billing (billing parallel in
   Monetization; not a beta gate)

### Next to design and build (Slice 2+)

1. Subscription tier model and gates (Feature 6) — free beta entitlements
   first; Paystack + Paddle later
2. Setup agent + structured business profile (Feature 7)
3. Remaining web surfaces: schedule view, profile settings (Feature 10)
4. WhatsApp channel, then Telegram (Features 8 and 9)
5. Structured memory + correction loop (Feature 11)
6. Later: comments/mentions, video generation, Facebook Pages, analytics,
   payments, system dark mode

### Explicit non-goals for early phases

- No custom/fine-tuned model
- No full autonomy before review-mode has proven the content quality
- No new platforms before SocialMCP has a stable adapter
- No casual consumer positioning; stay business-strict for sellers,
  founders, and builders

---



## 10. Open Risks (not solved by engineering)

- **Platform policy risk**: Meta/TikTok scrutinize automated-posting
behavior closely; app review can gate or throttle access; a policy
change can break functionality independent of code quality. Read
current automated-behavior policies before building deep on a platform.
- **Content quality is the actual differentiator**, not scheduling
(scheduling is a solved problem — Buffer et al.). Long-term tuning
effort goes here, not into infrastructure.
- **Trust adoption curve**: review-mode-first is not just safer
engineering, it is likely the only realistic path to real adoption.
- **External dependency coupling**: publishing and connectors fail
closed without a healthy SocialMCP deployment and Thesean key; that is
expected for this repo, not a broken product schema.

