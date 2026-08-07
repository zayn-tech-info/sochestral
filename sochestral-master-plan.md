# Sochestral — Master Plan

**Purpose of this document:** This is the full, locked vision and architecture for sochestral, covering everything from the original product vision through every technical and business decision made during planning. Cursor should review this against the current repo state (existing code, Linear issues, and the Tracer Bullet close-out project) before proposing any new work. Nothing here should be treated as "build this now" — it is the target state. Cursor's first job is to map what already exists against this plan, flag what's already done, what's in progress, what's blocked, and what conflicts, before any new issues are created.

**Project posture:** This is not a rushed project. The MVP is being released to beta testers first, with the rest of this plan phased in deliberately afterward. Do not treat the full scope below as MVP scope — see the MVP section for what's actually in scope for beta.

---

## 1. Full Product Vision

Sochestral is an AI social media manager for business owners, creators, and talents (including developers) who want to stay relevant online without spending their limited time managing social media themselves. It is explicitly **not** a generic tool for everyone — it is built for people who have a business or a personal brand worth investing in, but whose time is better spent elsewhere.

The AI (running through the orchestration layer, Thesean) is meant to:

- Understand the user deeply: their business, their audience, their competitors, and — for talents/developers — their individual skills and what makes them stand out.
- Generate content ideas that are tailored to the specific user's profile and goals, not generic or random content.
- Plan and schedule content on its own, with the user able to edit anything before or after.
- Know what's best and when it's best to post, based on both platform best practice and the account's own performance data.
- Learn from trending topics and incorporate that knowledge into content strategy.
- Create its own skills over time — i.e. build up a body of knowledge about what works, specific to each account.
- Learn from user corrections and never repeat the same mistake twice.
- Eventually run ads on the user's behalf — but only with explicit full-access permission from the user. When given that access, it should act as a professional ads manager: understanding what's working, studying ad performance, identifying what's lacking, and recommending or making improvements.
- Monitor the user's entire social media presence, to the extent each platform's API allows.
- Advise the user on where they can improve — not just execute, but proactively coach.
- Read data from the user's website, extract product images, monitor the site for updates (e.g. a new product going live), and when it detects a new product, automatically pull images, write a caption tailored to the business's profile, post it, and — with permission — run ads on it.
- Provide a calendar view so the user can see everything at a glance.

This is the full long-term vision. It is being built in phases, starting with a much narrower MVP (see Section 3).

---

## 2. Current Build Status (as of last review)

**Reality check:** the full vision above is significantly ahead of what the current codebase covers. What exists today is a business-strict AI social operator with a review-before-publish flow for Threads, LinkedIn Personal, and Instagram — not the full autonomous stack described above.

### Shipped / working in code

| Layer | What works |
|---|---|
| Foundation | Postgres product DB, auth/sessions, MCP JWT minting |
| Orchestration | Thesean LLM loop, fixed tool allowlist, arg validation, tenant-scoped SocialMCP client |
| Web | Login, chat workspace, Settings connectors, live platform preview aside |
| Publish path | Draft → edit → approve → publish APIs (review drafts + publish attempts) |
| Infra | Local Docker Postgres, Fly/Docker deploy work on `main` |

### In progress (built, not closed)

- Chat + connectors: code done; live SocialMCP/Thesean verify still open (SOC-5, SOC-18)
- Review-publish flow: automated tests green; three-platform live smoke test blocked (SOC-6, SOC-19)
- Preview aside: built; formal verify open (SOC-7)
- Intent clarify + Thinking UI: built; Thesean thinking flagged off (SOC-8)
- Publishing authority + images: mostly built; `PUBLISHING_AUTHORITY_ENABLED=false` until R2 / vision / `connectedAt` are wired up (SOC-9)

### Planned but not started (Slice 2+)

Tiers, setup agent / business profile, WhatsApp, Telegram, remaining web surfaces (schedule view, profile settings), structured memory, payments, analytics, comment/mention handling, video/image generation, Facebook Pages, dark mode.

### The all-social-mcp server (external dependency — this repo calls it, does not own it)

- **Platforms currently supported:** Threads, LinkedIn Personal, Instagram
- **Operations this product uses:** `list_connected_accounts`, `validate_post`, `publish_now` (model-facing publish is dry-run only; live publish goes through trusted review APIs), plus OAuth connect, schedules/worker, webhook ingestion
- **Product-owned tools:** the three above, plus `prepare_review` (drafts only)
- Tokens, posts, schedules, and publish logs live in the MCP's own database — never in Sochestral's Postgres

### Known technical debt / gaps

- Publishing authority and media handling flagged off pending R2, vision, and `connectedAt` wiring
- No business profile yet — the agent currently has a weak "knows my business" story
- No structured memory yet — corrections don't persist as rules
- Live OAuth, tool cards, and three-platform publish smoke test are the biggest open blockers

### MVP definition already agreed (Tracer Bullet)

The minimum path to prove for beta: sign up/provision + login → connect Threads/LinkedIn/Instagram → chat → agent drafts → review/edit in preview aside → approve → SocialMCP publishes → live result shown. No tiers, no messaging channels, no memory loop required for the first beta. Primary beta use case: "talk in plain language → review draft → publish to connected platforms."

MVP content scope, split by business type:
- **Physical product sellers:** AI-generated image + video content, anchored on product photos/video
- **Service/digital businesses (courses, agencies):** AI-generated image + text content only, plus the ability to upload their own custom video and schedule it

**Cursor's job before anything else:** confirm whether SOC-18, SOC-19, SOC-7, and SOC-8 are now closed (the user has since reported testing is complete and working), update status accordingly, and only then evaluate what in this master plan represents genuinely new work versus what's already been delivered.

---

## 3. Locked Architectural & Business Decisions

Everything below was deliberately worked through and locked, in this order. Each section supersedes any earlier, less specific plan. Where something is marked TBD, treat it as open — do not assume a default.

### 3.1 Model Architecture

Sochestral does not use one model for everything. The split is:

| Task | Model | Reasoning |
|---|---|---|
| Core agent — chat, drafting, judgment calls, the single voice the user talks to (Thesean) | Claude Sonnet 5 | Already proven, strong reasoning, high switching cost to move away from it |
| One-time deep onboarding / business profile creation | `ship-like/opus` or `ship-like/gpt-5.6-sol` (via the Thesean gateway) | High-stakes, infrequent, worth paying for depth |
| Mid-conversation business-profile edits (e.g. user says "we're pivoting to also sell X") | Same route as above, triggered on demand, not just at onboarding | Business profile is a living document, not just an onboarding artifact |
| Bulk analytics (ad performance numbers, engagement pattern detection) | DeepSeek V4 Flash | High-volume, pattern-matching work — doesn't need frontier reasoning |
| Trend / competitor scraping and research | DeepSeek V4 Flash | Same reasoning — volume matters more than depth here |
| Reading uploaded images (deciding caption, timing, platform) | GPT-5.6 Luna (vision) | Cheap, fast, sufficient for this decision — still pending a real benchmark against Gemini Flash and Claude vision before final lock |
| Generating images for posts | GPT Image 2 | OpenAI's dedicated image generation model, distinct from their text models |
| Correction/learning memory | Not a model call at all — a structured data layer | This should never be an LLM decision made fresh each time; store as rules and inject as context |

**Important context on Thesean:** Thesean is a real third-party inference-optimization gateway (not just an internal name for "our orchestration layer") that routes across 200+ models. Its `ship-like/` prefix applies inference-time optimization to get Opus/GPT-5.6-Sol-level quality at roughly 50% lower cost, backed by a quality SLA. All references to `ship-like/opus` or `ship-like/gpt-5.6-sol` in this document refer to calling those models through the Thesean gateway, not directly.

**Open item:** vision model choice for image-reading is not fully locked — needs a real benchmark against Gemini Flash and Claude Sonnet vision on actual product images before treating GPT-5.6 Luna as final.

### 3.2 Model Routing Architecture (Hybrid)

The user should only ever feel like they are talking to one agent. The routing model is:

- **Thesean (Claude Sonnet 5) is the only user-facing voice.** All other models are invisible backend labor.
- **Routine backend tasks run on a schedule, independent of the chat session** — ad performance analysis, trend scraping, and research go straight to DeepSeek without the user seeing or triggering them directly.
- The user never explicitly picks a model or is aware that multiple models are in use behind the scenes.

### 3.3 Tech Stack

- **Frontend:** Next.js + TypeScript
- **Backend (existing MCP layer):** Hono
- **Primary database:** Postgres, for all product/tenant data
- **MCP's own data (tokens, posts, schedules, publish logs):** stays in its own SQLite store, separate from product Postgres — this separation is intentional and should not be collapsed
- **Media storage:** Cloudflare R2
- **Hosting:** Fly.io, for sochestral, Thesean, and all-social-mcp

### 3.4 Context Management & Long-Term Learning System

The agent maintains four distinct per-account context files, each with a different owner and a different job. These are not user-visible documents by default (except where noted) — they are context the agent consults before generating content or taking any notable action.

| File | What it holds | Who writes to it |
|---|---|---|
| `business-profile.md` | Brand voice, tone, industry, target audience, competitors, product catalog summary — the "who is this business" file | Written once by the deep onboarding pass (Opus-tier). User-editable afterward. Also reopened by the same premium model route whenever the agent detects a genuine profile-level change mid-conversation |
| `rules.md` | Hard constraints — "never post on Fridays," "always mention free shipping," "no emojis on LinkedIn." These gate not just content generation but scheduling and ad decisions too | Written via the correction-confirmation loop (see 3.5), plus manual additions the user makes directly |
| `skills.md` | Self-generated knowledge — patterns the agent notices on its own, e.g. "posts with questions get 3x engagement for this account," "Tuesday 9am posts outperform." This is the file most closely tied to the self-improvement loop (Section 3.7) | Written autonomously by background pattern-detection jobs (DeepSeek). Not user-facing by default — could be exposed later via a "why did the agent do this" transparency panel, but that's not required for MVP |
| `memory.md` | The running short-to-medium-term log — recent interactions, corrections not yet promoted into `rules.md`, ongoing context like "we're launching product X next week" | Written continuously by Thesean during normal operation. Needs a size cap and pruning logic — this should not be allowed to grow unbounded |

### 3.5 Correction-Handling Loop

When a user edits a draft or rejects an agent's output, the system should:

1. Auto-detect that a correction happened (from the edit or rejection itself).
2. Queue a lightweight confirmation prompt — e.g. "Got it — should I always do this going forward?" — rather than either (a) silently turning every edit into a permanent rule, or (b) requiring the user to explicitly say "remember this" every time.
3. Only promote a correction into `rules.md` once the user confirms it.

This is a deliberate middle ground: pure auto-detection risks locking in a wrong assumption from a single bad edit; pure manual-only misses patterns the user won't bother typing out explicitly.

### 3.6 Cost of Building

**Context:** solo-built, self-funded, no other developers/designers on the team, no current investment.

**Cost to reach beta launch (infra only, before real users generate usage):**
Roughly $50–100/month — Fly.io hosting, managed Postgres, R2 (near-zero until real image volume), domain, email service. This does not include API/model costs, since those only start accruing once real users are active.

**Cost per active user per month, by tier, at full usage of that tier's image cap:**

| Tier | Image cap/month | Total cost to Sochestral per user/month |
|---|---|---|
| Starter | 30 images | $1.47–$5.45 |
| Pro | 60 images | $2.37–$8.45 |
| Agency | 100 images | $3.57–$15.45 |

Cost breakdown per user includes: Sonnet 5 chat/drafting, DeepSeek Flash bulk tasks, `ship-like/opus` profile-update calls, GPT-5.6 Luna image reading, GPT Image 2 generation (the dominant cost line by far), and R2 storage/egress (negligible at this scale). Self-improvement research (Section 3.7) adds a small additional variable cost per user, discussed there.

**Image generation is the single biggest cost-scaling factor per user** — far more than chat or research. This is why image caps are hard, tier-based limits rather than unlimited/flat-rate (see 3.6.1).

#### 3.6.1 Image Generation Caps — Mechanics

- **Tier caps:** Starter 30 images/month, Pro 60 images/month, Agency 100 images/month (flat numbers, not ranges).
- **At the cap:** hard stop. No automatic overage billing — the user must upgrade to a higher tier to get more access.
- **Regenerations:** unlimited regenerations are allowed on any image, but every regeneration counts against the same monthly cap as a new image. There is no separate free-regeneration allowance.
- **Video generation is excluded from MVP scope entirely** — not capped differently, simply not available yet. (Note: MVP content scope in Section 2 does allow physical-product sellers to upload their own pre-made video and schedule it — that's a user-supplied asset, not AI-generated video, and is a different feature from this cap.)

### 3.7 Pricing

**Approach:** Regional (PPP-style) pricing — Nigeria priced at a discount to the global USD reference price, rather than a single global price or geography-blind capability tiering. Final discount landed at 20% off global (not the initially-modeled 50%, which would have compressed margins too far, especially at the Agency tier under heavy usage).

**Final locked pricing:**

| Tier | Global (USD/month) | Nigeria (NGN/month) | Trial | Image cap |
|---|---|---|---|---|
| Starter | $15 | ₦15,000 | 3-day free trial | 30 images |
| Pro | $30 | ₦30,000 | No trial | 60 images |
| Agency | $65 | ₦65,000 | No trial | 100 images |

**Margin health at worst-case usage (user maxes their image cap every month):**

| Tier | Price (global) | Cost at max usage | Margin |
|---|---|---|---|
| Starter | $15 | $5.45 | ~64% |
| Pro | $30 | $8.45 | ~72% |
| Agency | $65 | $15.45 | ~76% |

Margins hold comfortably across all tiers even at full image-cap usage.

**Payment processors:**
- **Nigeria:** Paystack — chosen over Flutterwave for reliability and being the standard default for Nigerian SaaS/subscription products. Flutterwave's broader pan-African/multi-currency reach isn't needed at MVP stage.
- **Global:** Paddle — chosen over Stripe specifically because Paddle acts as merchant of record, handling VAT/tax compliance across countries automatically. Given this is a solo-founder project, offloading that compliance burden is worth Paddle's slightly higher fees versus Stripe's cheaper-but-DIY-tax-compliance model.
- Users should select their country/currency explicitly at signup (not rely purely on IP-based detection, which can be wrong or spoofed) to determine which processor and price they see.

### 3.8 Self-Improvement Mechanism

The agent should continuously get better at understanding what works for each specific account, and it does this in two feeding streams that get compared against each other:

1. **External research (per-account, not shared globally across users).** Trend and best-practice research is run per account, not once for the whole platform — because what's trending for a real estate agency and what's trending for a tech agency are genuinely different, and shared/global research would be too generic to be useful. This research covers: what's currently working on each relevant platform, platform-specific algorithm/best-practice advice, and optimal posting times. This should run on DeepSeek V4 Flash given its volume and lower need for deep judgment.

2. **Internal performance tracking.** Continuously logged from each account's actual post performance (engagement, reach, timing outcomes), sourced from data already available via the MCP's analytics. No additional model cost here — it's data collection and analysis, not generation.

**How the two streams resolve conflicts:** when external research and internal performance data disagree (e.g. "general advice says post at 9am" but this specific account's data shows 6pm consistently outperforms), **internal data wins by default** — it's ground truth for that specific account. External research is used to fill gaps where there isn't yet enough internal data, or to reinforce/confirm what the internal data already shows.

**Research frequency:** not a hard cap. Baseline is a minimum of 2 research passes per day per account. On top of that baseline, the user can request a search at any time, and the agent itself can decide to run additional research beyond the baseline whenever it judges it's warranted — most notably, if it notices a meaningful drop in an account's performance, that should trigger an out-of-cycle, deeper research pass for that account rather than waiting for the next scheduled cycle. This applies equally across all tiers — there is currently no tier-based differentiation on research frequency (this was considered and explicitly not adopted).

**Cost note:** at minimum 2 passes/day (60/month) per account, plus variable on-demand research, the realistic cost is roughly $0.10–$0.72+/month per user on the DeepSeek/model side alone, with actual cost depending on how often users or the agent trigger extra searches beyond baseline. This is still small relative to image generation, but unlike the fixed image caps, this cost is now open-ended per account rather than a hard-capped number — worth monitoring once real usage data exists, rather than assuming the estimate above holds at scale.

---

## 4. Instructions to Cursor

1. **Do not treat this document as a list of new work.** Cross-reference every section above against the current repo state, Linear (especially the Tracer Bullet close-out project and any Slice 2 backlog items), and actual deployed behavior.
2. **Surface what's already done.** The user has reported that live testing (previously blocking items like SOC-18, SOC-19, SOC-7, SOC-8) is now complete and working — verify this against the repo/Linear state and update status accordingly before planning new work.
3. **Identify genuine gaps** — decisions in this document (model routing, the four context files, image cap mechanics, pricing/billing integration, the self-improvement research loop) that have no corresponding code or Linear issue yet.
4. **Identify conflicts** — anywhere the current implementation contradicts a locked decision above (e.g. if research or memory is currently implemented differently than the `business-profile.md` / `rules.md` / `skills.md` / `memory.md` model described in 3.4).
5. **Sequence by dependency, not by section order in this document.** For example: billing/pricing integration depends on tiers existing; tiers depend on the business-profile/rules/skills/memory system existing in some form; the self-improvement loop depends on internal performance tracking already being collected. Finish-before-new-plan applies: anything currently blocked or in-progress in the existing MVP path should be prioritized over any net-new feature from this document, regardless of how exciting the new feature is.
6. **Do not generate Linear issues from this document directly.** The user will handle issue creation as a separate, explicit step.
