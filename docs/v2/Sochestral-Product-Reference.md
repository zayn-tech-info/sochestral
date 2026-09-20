# Sochestral — Product Vision and Operating Reference

**Version:** 1.3 · **Updated:** 10 September 2026  
**Owner:** Founder / product owner  
**Companion:** `Sochestral-Agent-Implementation-Guide.md`  
**Purpose:** The reference for what we are building, why users would choose it, how it should feel, and how the business should work.

## P01. How to use this document

Return to this document when discussing scope, priorities, pricing, or changes. Refer to the section number: for example, “Let us change P10 billing” or “Expand P06 brand memory.” Update the relevant section and decision register, then synchronize the agent guide if implementation is affected.

This is a product blueprint, not a claim that every feature already exists. Current-state descriptions come from the two coding-agent handovers supplied by the founder. No new repository audit was performed while writing these files. A subsequent source-inspection handover identifies the correct SocialMCP repository. Its live delivery behavior remains unverified here.

**Agreed** means established in our conversation. **Proposed** means a recommendation to validate. **Open** means a decision is still needed. A useful suggestion should not silently become a compulsory feature.

## P02. What Sochestral is

**Category:** AI content partner.

**Plain explanation:**

> Sochestral is your AI content partner. It learns your brand, turns your ideas and everyday work into content plans, creates posts in your voice, and schedules them across your social accounts. You guide the direction, and it handles the work.

**Mission:** Help people turn what they know, build, and sell into a consistent social presence without making content management another full-time job.

**Proposed headline:** Turn what you do into content worth sharing.

**Supporting promise:** Bring a rough idea, a voice note, or your brand. Review a thoughtful plan, refine the posts, and let Sochestral handle the schedule.

This describes the destination. Until correction memory and the full workflow are implemented, launch copy must describe the capabilities actually available.

The central user outcome is less effort between real ideas and content they are proud to publish. Useful measures include fewer repeated instructions, less editing, faster approval, and reliable scheduling. Volume alone is not the goal.

## P03. Who it serves and how to start

| Audience | Their problem | What Sochestral should do |
| --- | --- | --- |
| Business owners | Running the business leaves little time to decide what to post | Turn products, services, questions, offers, and activity into useful content |
| Founders | They have updates and lessons but struggle to communicate consistently | Turn product changes, insights, evidence, and milestones into a coherent narrative |
| Creators | Ideas accumulate without an organized publishing rhythm | Develop themes and series, repurpose source material, and manage a content calendar |

People may belong to more than one group. Onboarding should adapt the planning questions rather than force a permanent identity.

**Proposed first customer group:** People who personally manage their own content alongside another demanding role. Recruit across the three audiences and observe the shared workflow before investing in separate product editions.

Global use is a long-term ambition. Build for timezone clarity, voice flexibility, and language preferences, but validate supported languages and platform access. Do not claim universal publishing or cultural fluency without evidence.

Launch scope is one brand per user. Multiple brands may be considered after launch and are not part of the current build. Agencies and multi-person teams can become an expansion audience; multi-brand ownership and team permissions need deliberate future design.

## P04. Why users would choose it

AI captions, repurposing, calendars, and scheduling already exist in competing products. Buffer describes AI drafting and repurposing, while Predis describes branded creation, scheduling, and approval features. This makes “we have an AI writer and calendar” a weak standalone distinction. Sources: [Buffer](https://buffer.com/ai-assistant), [Predis](https://predis.ai/features/).

**Our proposed differentiator is the complete experience:**

1. Content begins with the user's actual business and knowledge.
2. The plan is visible and easy to discuss before everything is generated.
3. Corrections improve future work instead of being forgotten.
4. The agent carries approved work through to a clear scheduling outcome.

A user should be able to answer: “Why is this topic in my plan?”, “What did it learn from my correction?”, and “Did my post actually get scheduled?”

We should validate that customers value this combination. It is a positioning hypothesis, not proof that competitors lack every element.

## P05. The complete user experience

### 1. Establish the brand

Collect enough context to generate something useful: what they do, audience, goals, website or source material, preferred channels, writing examples, and timezone. Ask optional details progressively instead of turning onboarding into a lengthy form.

Show a short editable summary of what Sochestral understood. Distinguish verified facts from assumptions. A humorous creator and a formal business should not receive the same default voice.

### 2. Begin a campaign or request

The user can ask for a post, a week of content, a launch campaign, or help organizing ideas. Use context already supplied and ask a few interview questions only when they improve the result.

Questions might cover current priorities, new developments, available assets, and desired direction. Usually two or three are enough to start. Avoid repeatedly asking what the business does.

### 3. Respect delegation

If the user indicates “you decide,” “nothing new,” or equivalent intent, proceed using known context and research. If they answer one question, retain the answer and fill the remaining planning gaps appropriately.

Delegation authorizes useful planning initiative. It does not authorize invented business facts or immediate publication. If live research is unavailable, say so briefly and offer a plan grounded in existing material.

### 4. Open the plan document

Show a polished persistent document with:

- Goal and intended audience.
- Voice and content direction.
- Themes and series.
- Proposed calendar with angles, formats, and channels.
- Sources, assumptions, and missing material.

Use consistent brand colors, strong headings, subtle labels, comfortable text, and readable tables. For large plans, provide a summary and navigation by week/theme. The document should feel carefully designed without requiring the user to understand Markdown.

### 5. Comment and revise

Users highlight text and add a comment. “Review comments” submits their feedback to the agent. The agent updates the same document, preserves previous versions, and summarizes changes.

Comments survive refresh and revision. If a section disappears, its comment remains visible for reassignment or closure. Unclear feedback becomes a focused question rather than an arbitrary edit.

### 6. Approve direction and create content

“Approve plan” accepts the strategy. “Create content” produces finished posts, platform variants, and the necessary media work. Users see real captions and visuals before content approval.

An angle such as “customer success story” is not permission to fabricate a testimonial. The agent should request evidence or propose a factual alternative.

### 7. Review finished posts

Let users edit directly, comment, regenerate selected parts, or exclude items. Show incomplete assets and unsupported claims clearly. Do not force a full campaign regeneration for one unsatisfactory caption.

### 8. Review scheduling details

“Schedule” opens the proposed dates, times, timezone, destinations, and selected posts. Users make adjustments and click “Confirm schedule.” This action starts actual scheduling.

### 9. Follow progress and publication

Display queued, scheduling, scheduled, and needs-attention items accurately. An uncertain remote outcome should show “Checking status,” not an invented failure or success.

Example: “27 scheduled · 11 queued · 2 need attention.” Users can inspect and resolve the two items without repeating the other 38.

When due, completed scheduled posts publish through the delivery service. Show confirmation where available. The user should not need to keep the page open.

**Short requests:** A single-post request can use a compact version of this flow. Do not force a multi-section campaign document for a tiny edit. Retain content review and schedule confirmation appropriate to the action.

## P06. The feature set that earns repeat use

| Feature | User benefit | Priority |
| --- | --- | --- |
| Interview with delegation | Help even when users have no topics ready | Core |
| Plan document with comments | Understand and steer the strategy | Core |
| Brand memory and corrections | Stop repeating the same instructions | Core |
| Reliable batch scheduling | Hand over a campaign with confidence | Core |
| Source inbox | Capture material before it gets lost | Next |
| Reusable visual templates | Finish branded posts with less design effort | Next |
| Optional weekly check-in | Know what to do next without starting from zero | Later |
| Performance-informed planning | Use observed results to improve future experiments | Later |

### Brand memory

Remember business facts, voice examples, preferences, active goals, approved sources, content history, and explicit corrections. Keep campaign-specific instructions scoped to that campaign. Track expiry for offers and events.

Explicit instructions can become memory immediately. Inferred patterns should be proposed: “Should I use this shorter opening style in future?” A one-time edit should not silently rewrite the brand's voice.

Users must be able to inspect, correct, and remove memory. Useful memory is controlled context, not a promise of automatic model training.

### Source inbox

Users add rough sentences, links, screenshots, photos, voice notes, articles, or transcripts. Sochestral identifies possible content angles and links them to the original material.

Example: a founder uploads a screenshot of a product improvement. The agent proposes an announcement, a practical explanation, and a lesson from building it. These are proposals, not three invented experiences.

Begin with direct inputs; add integrations when repeated usage identifies a valuable source. Screenshots containing customer information require appropriate handling and review before reuse.

### Visual completion

Mark asset needs per post. Reuse approved photos, screenshots, and templates; offer generation as an explicit paid action. Preserve real product identity and factual claims.

Prioritize editable branded images and carousels. Video scripts and shot lists can provide value before a full video-generation product is justified.

### Optional weekly initiative

An opt-in check-in can flag unused ideas, an unfinished series, or an approaching calendar gap. It should propose work, respect cadence preferences, and follow existing approval/spending permissions.

### Learning from results

Use available authorized metrics to suggest the next experiment. Report missing data. Treat reach, engagement, clicks, and business outcomes as different signals; do not equate likes with sales or one strong post with a guaranteed strategy.

## P07. Chat, modes, and control

**Agreed design principle:** Borrow the clarity of coding-agent workflows: planning is inspectable, execution is visible, and users can revise an artifact before proceeding.

**Proposed interface:**

| Control | Meaning |
| --- | --- |
| Plan mode | Interview, research, develop direction, revise plan |
| Agent mode | Carry out approved creation and scheduling work |
| Standard quality | Lower-cost everyday model routing |
| Advanced quality | More capable routing for demanding work, with higher estimated credits |

Modes describe workflow; quality describes resource choice. Switching a mode does not itself consume credits or authorize publication. Natural-language intent and contextual action buttons should keep the interface usable for people unfamiliar with agents.

Show actual progress such as “Reading brand context,” “Reviewing sources,” or “Applying comments.” Internal reasoning is not a product requirement. Status messages must correspond to real work.

**Trust boundary — agreed:** Sochestral is a content planner and scheduler. Remove immediate publishing and the full-access/trusted-autonomy concept and implementation. Every content execution path requires review and explicit schedule confirmation, regardless of user role, mode, or delegation. Users can inspect finished content, destinations, dates, and progress before delivery. Publication occurs only through due-time scheduled delivery. Planning initiative remains useful but never bypasses review or scheduling approval.

## P08. Scheduling and the promise of scale

The founder's direction is clear: willing customers should be able to buy more AI work without an arbitrary 30-post ceiling.

That does not mean sending 100 requests simultaneously. The system can accept a larger campaign and process manageable batches while respecting platform rules, account status, service capacity, and spending authorization.

Distinguish:

- How many days the plan covers.
- How many content ideas exist.
- How many platform/account deliveries those ideas produce.
- How many operations run concurrently.
- How much AI work the user has funded.

One idea adapted to three accounts can create three separate delivery operations. Costs and progress must not hide this distinction.

Approved content is stored before scheduling. Restarting a queue must not rewrite it. A timeout may mean the remote request succeeded; the system must check before retrying. Ready items should survive a sibling's failure.

Publication should not require new AI generation. If optional future “refresh before publishing” features are introduced, they need separate product rules and renewed content approval where appropriate; they are outside the core promise.

## P09. Model strategy

Use a small, explicit set of roles and measure outcomes before adding complexity.

| Work | Starting candidate | What we must evaluate |
| --- | --- | --- |
| Everyday interview, planning, captions, revisions | Thesean Ship-like Sonnet 5 versus GPT-5.6 Terra | Voice, useful angles, tools, cost to approval |
| Extraction, tagging, source summaries | Thesean Ship-like GPT-5.6 Luna | Accuracy and reliable structured output |
| Complex strategy, extensive synthesis, difficult revisions | GPT-6 Astra | Whether better decisions justify total cost |
| Transcription | Dedicated transcription model; selection open | Accuracy, languages, cost |
| Visual generation | Dedicated image model; selection measured separately | Brand/product fidelity, editable workflow, cost |
| Scheduling, permissions, payments | Application code | Correctness, recovery, auditability |

These are evaluated candidates, not guaranteed winners. Thesean advertises matching reference behavior at lower cost; actual suitability must be measured in Sochestral. Availability and discount for Astra through Thesean are not confirmed.

Astra is most interesting when a task has many sources, audiences, constraints, and revisions. It can establish strategy while another model creates individual posts from the approved brief. Every handoff must retain brand context and decisions.

Assess models using representative customer examples and human review. Measure total work required to produce acceptable content, including corrections, retries, tools, and latency. A low token rate alone does not establish the cheapest successful workflow.

Keep model prices out of permanent product promises. Maintain a dated rate card internally and verify providers when implementing. References from the planning discussion: [Thesean models](https://docs.thesean.ai/api-reference/models), [OpenAI models](https://developers.openai.com/api/docs/models), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).

## P10. Billing and payment model

**Working launch decision:** Paddle payments, Starter at $15/month with 1,000 AI credits, and Plus at $35/month with 3,000 AI credits. Proposed working top-ups are $5/400, $10/800, and $25/2,000 credits. Validate costs before paid launch; expiry and remaining commercial policies are deferred.

### What the subscription covers

Connected-account access within its entitlement, content workspace, manual editing, calendar management, storage allowance, and ordinary scheduling/publication. These are ongoing services with ongoing operating costs.

### What credits cover

| Action | Proposed treatment |
| --- | --- |
| AI interview, plan generation, research, revisions | Credits |
| AI drafting and repurposing | Credits |
| Brand/source analysis | Credits |
| Transcription and image generation | Credits at appropriate rates |
| Viewing, commenting, manual editing | Included |
| Scheduling completed posts | Included within active subscription |
| Internal retries caused by our failure | No duplicate customer charge |

Use one balance across workflow modes. Users should not manage unrelated wallets for captions, plans, and research.

When credits run out, pause new AI work and offer a top-up or reduced task. Preserve drafts and manual editing. Already completed scheduled posts should publish while service entitlement remains active.

### Working launch offer

| Plan | Monthly USD price | Included AI credits |
| --- | ---: | ---: |
| Starter | $15 | 1,000 |
| Plus | $35 | 3,000 |

Both plans include the core planning, commenting, brand-memory and scheduling experience. Standard and Advanced model choices are available on both, with different usage consumption. Plus mainly provides more usage and better credit value. Do not introduce arbitrary scheduling caps or lock essential review features behind Plus.

Working top-ups: $5 buys 400 credits; $10 buys 800; $25 buys 2,000. The internal starting conversion is one credit per $0.003 of eligible provider expense: roughly $3 of included provider expense on Starter and $9 on Plus. This is a provisional economic configuration, not a promised number of posts. Remaining revenue must cover payment fees, infrastructure, storage, support, and profit. Track fractions internally rather than imposing a whole-credit minimum on every tiny call.

The founder deferred trial, rollover, expiry, cancellation, account limits, and other detailed policies. Previously suggested figures for those policies are not approved. Keep configuration flexible and disable unfinished actions; proceed with the core build and sandbox billing.

### Establish prices from evidence

Measure an interview and two-week plan; researched campaigns; 10/30/100-post generation; revision rounds; media; and delivery operations. Include provider costs, retries, hosting/storage, fees, and support allowance.

For an illustrative internal calculation, if the allocated variable cost of an AI task is C and the target contribution margin is m, the corresponding revenue before other adjustments is C / (1 − m). This is a planning calculation, not a selected margin or a complete pricing model. Check willingness to pay and ongoing subscription economics separately.

Show useful estimates: the expected credit range, selected quality, included operations, and a maximum authorized spend. If more work is needed, preserve progress and ask before increasing the budget. Do not silently downgrade quality or change the model tier.

Reserve credits for accepted background work, settle billable completed work, and release unused reservations. Canceling work does not necessarily make already completed authorized generation free. Explain the policy clearly.

### Decisions needed before taking payment

- Paddle onboarding/payout approval and checkout currency configuration; Paddle is selected.
- Included credits, top-up sizes, and whether they expire or roll over.
- Trial allowance and abuse controls.
- Account/brand/storage entitlements.
- Subscription cancellation, payment-failure grace period, and future schedule handling.
- Refund/dispute policy and treatment of partially completed jobs.
- Optional auto-top-up with explicit spending caps.

## P11. What exists and what changes

According to the supplied handovers, auth, database, streaming, draft review, brand entries, voice/design compilation, and role-based model configuration provide a useful foundation. Live calendar/connector/delivery behavior depends on SocialMCP and was not exercised by the reporting agent.

The main transition is:

| Existing reported approach | V2 direction |
| --- | --- |
| Plans in chat and a flat snapshot | Persistent structured document with comments/versions |
| User must bring topics for multi-day work | Interview, then intent-based delegation |
| Campaign generation schedules directly | Generate, review, then confirm schedule |
| Campaign advances through days with a 30-post cap | Durable content items and recoverable destination operations |
| Brand context differs between chat and workers | Shared relevant context |
| No correction memory | Explicit preferences plus proposed learned patterns |
| Image-only monthly credits | General usage measurement and shared AI ledger |
| Formal/business-strict wording defaults | User-matching voice with accurate business claims |

The historical scheduling root cause remains unknown. Debug instrumentation suggests an investigation around the planning gate, while the handover also identifies potential booking-loop problems. Tests and source inspection must separate those issues.

We are improving a product, not approving a wholesale rewrite. Existing schedules and useful work must survive.

## P12. Roadmap and release boundaries

| Stage | User outcome | What must be true before moving on |
| --- | --- | --- |
| Baseline and diagnosis | Known behavior, reproducible problems | Correct repository/contract; targeted failures understood |
| Context and accounting | Consistent brand understanding; visible operating costs | Chat and workers use relevant context and report usage |
| Scheduling foundation | Accurate progress and recoverable batches | Durable approved content; duplicate-safe reconciliation |
| Plan/review experience | Inspect and steer strategy and posts | Versions, comments, approval gates, date confirmation |
| Personalization | Less repeated instruction | Explicit memory and scoped corrections work |
| Models and billing | Clear paid usage with quality choices | Measured costs, budget enforcement, payment policy |
| Pilot and transition | People use the complete experience | Authorized live verification and no abandoned legacy work |
| Expansion | Greater ongoing usefulness | Weekly use justifies templates, check-ins, analytics, integrations |

A closed beta may use invited accounts. Public launch needs a workable signup or invitation path and account recovery, rather than disabled buttons promising functionality.

**Keep out of the first core release unless evidence changes the priority:** full video production, many unverified platform connectors, autonomous replies/DMs, elaborate agency permissions, and a large marketplace of models. Record requests; avoid distracting from the core workflow.

## P13. How to demonstrate and sell it

**Proposed demonstration:** A user supplies a short voice note and a few brand examples. Sochestral asks two useful questions, produces a focused plan, incorporates a highlighted comment, generates posts in the user's voice, and confirms a schedule.

The demonstration should show real input, a real correction, and an actual scheduling outcome. That makes the promise tangible.

Use audience-specific examples of the same product:

- Founder: “Turn this week's product work into clear updates.”
- Business owner: “Turn customer questions and your services into next week's content.”
- Creator: “Turn your scattered ideas into a series you can keep publishing.”

A proposed landing-page sequence is: plain promise; short workflow demonstration; examples by audience; memory and review explanation; scheduling reliability; transparent pricing; a trial call to action. Avoid promising virality, guaranteed sales, or total replacement of human judgment.

## P14. Metrics that tell us whether it works

| Question | Measure |
| --- | --- |
| Does onboarding lead to value? | Share of new users reaching an approved plan and finished post |
| Does it save effort? | Time to approval and substantive edits required |
| Does memory help? | Repeated correction frequency and preference adherence |
| Is delivery dependable? | Confirmed scheduling/publication rates, duplicates, unknown outcomes |
| Do people return? | Weekly active planners and subsequent campaigns |
| Is it economically sustainable? | Cost per approved item/campaign and contribution after service costs |
| Will users pay? | Trial-to-paid conversion, paid retention, top-up behavior |

Set numerical targets after observing the first cohort. Distinguish support-assisted success from users completing the workflow themselves. Reach and engagement can support later insights, but they should not disguise a product that takes too much editing or fails to deliver.

## P15. Decision register

| ID | Decision | Current position |
| --- | --- | --- |
| D01 | Audience | Agreed: business owners, founders, creators |
| D02 | Interview and delegation | Agreed: ask a few questions; proceed based on intent |
| D03 | Document workflow | Agreed: polished plan, highlights/comments, revisions |
| D04 | New core publishing workflow | Agreed: review and schedule before due-time publication |
| D05 | Legacy trusted autonomy/immediate publish | Agreed: remove immediate publishing and full-access/trusted-autonomy modes; all content execution requires review and schedule confirmation |
| D06 | Commercial 30-post ceiling | Agreed: remove arbitrary ceiling; retain operational controls |
| D07 | Billing structure | Paddle; working Starter $15/1,000 and Plus $35/3,000; optional top-ups |
| D08 | Commercial follow-up | Working prices selected; measure economics; expiry/lapse/trial rules deferred |
| D09 | Model role map | Proposed candidates; evaluate before fixing defaults |
| D10 | Brand voice | Agreed direction: user-matching rather than universally formal |
| D11 | Multiple brands at launch | Agreed: one brand per user; multiple brands deferred for consideration after launch |
| D12 | Source inbox/templates/check-ins/analytics | Proposed staged additions |
| D13 | SocialMCP source and live guarantees | Repository identified; source findings supplied; fixes and live behavior need verification |

## P16. Rules for changing the plan

When a change is proposed, record the section, user problem, expected benefit, affected workflow, cost/complexity, approval implications, and success measure. Label it proposed until adopted. Update the agent guide's phase and acceptance checks after adoption.

Preserve the central promise: the user contributes real context and editorial direction; Sochestral makes the planning, creation, revision, and scheduling easier to complete. Evaluate new features against that promise and evidence from users.

**Next concrete step:** Give the updated companion guide to the coding agent and begin Phase 0 across Sochestral and `all-social-mcp`. Implement the design as part of the release. Use working prices in configurable sandbox billing; leave deferred policies unresolved until needed for live paid launch.


## P17. Design specification — included in the product release

The supplied screenshots establish a pink accent, rounded surfaces, a central chat composer, calendar, account connections, memory, onboarding, and a post editor. Keep this identity and refine the experience. These are implemented release requirements, not merely design mockups.

### Appearance

One user-selectable accent, pink by default, with presets and custom choice. Automatically derive readable shades for buttons, selected navigation, highlights, and focus. Support light, dark, or device appearance and remember the preference across devices. Neutral backgrounds and restrained shadows keep content prominent. Status colors remain recognizable and separate from the accent. Changing interface color must not change colors used in the user's generated brand assets.

### Screen alignment and behavior

| Screen | Intended experience |
| --- | --- |
| Header/navigation | Compact useful header; clear labels; collapsible navigation; Calendar and List belong together |
| Workspace | Familiar starting composer, then chat with an expandable plan/preview panel |
| Plan | Readable document with sections, tables, versions, highlighted comments, revision summary, and clear next action |
| Post editor | Editing controls alongside preview on desktop; one clear save action and accurate outcome feedback |
| Calendar | Full week reachable; meaningful caption/account previews; visible timezone; filters and agenda alternative |
| Accounts | One list with recognizable handles and connect/reconnect actions; avoid duplicated card/table listings |
| Memory | Human-readable, editable facts and preferences rather than a raw compiled prompt |
| Onboarding | Same visual theme; short description accepted; ask what help the user wants rather than requiring content skills |
| Errors | Explain the problem and next action; service outages must not falsely mark login credentials invalid |

Readable starting sizes are 16px body, 14px controls, and 28–32px page titles, with consistent spacing. Accent should guide attention, not decorate every border. Exact tokens should be taken from the current code and refined, rather than estimated from screenshots.

### Responsive experience

Desktop: navigation, chat, and document can sit side by side. Tablets/smaller laptops: collapsed navigation and switchable or resized panels. Phones: one surface at a time, easy Chat/Plan switch, full-screen documents, bottom-sheet comments, agenda-first calendar, and stacked editing with a Preview tab.

Preserve reading position and unsent text. The keyboard and bottom action bar must not cover inputs. No essential task depends on hover or drag. Give touch users section-level commenting as an alternative to precise highlighting.

Validate the full workflow at phone, tablet, and desktop widths, in light/dark/custom accent states. Include loading, empty, partial completion, insufficient balance, reconnect, missing media, and uncertain scheduling. Screenshots alone do not establish working responsiveness.

## P18. What the SocialMCP handover changes

The correct repository is [zayn-tech-info/all-social-mcp](https://github.com/zayn-tech-info/all-social-mcp), inspected in the supplied report at `8a6317a`. The source report identifies scheduling tools, adapters, persistence, and a publication worker; it does not provide fresh live verification.

The main required improvements are user-scoped replay-safe scheduling, atomic worker claiming, recovery after uncertain platform acceptance, coordinated edits/cancellation, and truthful status. Without these, a large batch can create duplicate or misleading outcomes. Locking alone cannot guarantee exactly-once remote publication after a crash; uncertain cases need reconciliation and sometimes manual review.

Sochestral owns content generation, review, time conversion, billing, and the submission queue. SocialMCP owns connected accounts and due-time publication. Generation already being separate from delivery supports our no-AI-credit-required-at-publication principle.

The composer must match actual adapter capabilities. In particular, the supplied report says LinkedIn supports one image or one video, not a carousel; this conflicts with the earlier product-side allowance. Verify current capabilities and use them to control the UI. Do not promise support for platform stubs.

## P19. Deferred policies and build boundaries

The founder chose one brand per user for launch. Multiple brands are deferred until after launch. The founder chose to defer the detailed trial allowance/duration, number of connected accounts, rollover and expiry rules, auto-top-up, cancellation/grace period, subscription requirements for spending top-ups, upgrade/downgrade mechanics, and refunds. The previously proposed defaults for these are not accepted requirements.

Continue the full core build with configurable policy boundaries. Paddle sandbox checkout, metering, design, documents, memory, and reliable scheduling can proceed. Do not invent live customer terms or enable a commercial action whose necessary policy remains unset. Resolve those specific terms at the paid release gate without repeatedly blocking independent engineering work.

**Revision 1.1 — 10 September:** Updated from the SocialMCP handover, UI screenshots and design discussion, Paddle decision, working two-plan credit model, top-up proposal, and the founder's explicit policy deferral. The companion guide now includes repository-specific fixes and UI acceptance criteria.

**Revision 1.2 — founder decision, 10 September:** Remove the immediate-publish feature and all full-access/trusted-autonomy bypasses. Content is reviewed and explicitly scheduled, then published when due. Preserve planning, idea generation, and the other agreed V2 capabilities. Implementation and migration remain outstanding.

**Revision 1.3 — founder decision, 10 September:** Launch with one brand per user. Multiple-brand support may be considered after launch; it is not a current implementation requirement. This does not set a connected-social-account limit.
