# Rationale: Live platform preview aside

## Context

The review loop already persists drafts and publishes through trusted product routes. The web presentation puts a View review control under chat and opens a modal. That feels like a draft log, not like seeing the post on the real network. Users asked to remove that log and to preview the end result in a right hand aside that looks like Threads, LinkedIn, or Instagram, including images, with in place editing and approve in the same place. Publishing authority and automatic live intent must keep working. After go live, users still need to see that it is live and what went live.

Not deciding leaves the product stuck with a modal that fights the OS chat redesign and hides the visual outcome until after publish.

## Options considered

### Option 1: Live platform preview aside over existing review APIs

Replace the modal and launcher with an auto opening right aside. Reuse review drafts, attempts, and mutation routes. Build faithful light mode single post chrome per platform. Keep group approve and authority rules.

**Pros**:

- Matches the requested end result feel
- Keeps trusted publish and idempotency
- No schema migration

**Cons**:

- Platform chrome maintenance cost
- Chat column shares space with the aside

### Option 2: Keep the modal, only restyle it

Improve the existing review dialog visuals without an aside.

**Pros**:

- Smaller UI change
- Spec 0005 AC-11 stays literally true

**Cons**:

- Still a draft log entry in chat
- Does not deliver the live screenshot feel as a standing workspace surface

### Option 3: Client only preview until Approve creates the review set

Render a local preview from chat text and only create review drafts at approve time.

**Pros**:

- Feels instant

**Cons**:

- Splits draft truth between client and server
- Breaks revision, validation, and automatic live preflight already built in 0005 and 0006

## Rationale

Option 1 is the only path that removes the draft log, delivers platform true preview, and keeps the hard won publish safety. Option 2 fails the product ask. Option 3 reopens draft authority bugs we already closed. Reusing the review model means this is a presentation strangler, not a second draft system. Light mode only keeps scope honest; structuring tokens for later system dark avoids a throwaway aside. Faithful single post frames (not full fake apps) give screenshot credibility without fake navigation. In place edit next to Approve matches how people check a post before sending.

## Design notes settled by the architect (RECOMMEND)

- Prefer a persistent chat layout column for the aside on desktop, not only the generic slide over drawer used for Settings style panels, so the preview stays visible while chatting.
- Place platform chrome components under `web/src/components/preview/` with one module per platform, driven by draft and account props.
- Non functional like, comment, and share glyphs are decorative only.
- When connectors omit an avatar URL, use a monogram placeholder from the account display name.
- Character guidance comes from existing draft validation messages, not a new limits service in this slice.

## Reference screenshots (engineer provided)

Checked in under `references/`:

- `threads-text-dark.png`, `threads-video.png`, `threads-media-grid-dark.png`: Threads post anatomy (header, body, media including video and side by side media, engagement row).
- `linkedin-video-light.png`, `linkedin-sponsored-video.png`: LinkedIn post anatomy (header, truncated body, media player frame, reactions). Sponsored Follow chrome is reference only; organic posts omit Follow and Promoted.
- `instagram-carousel-1.png`, `instagram-carousel-2.png`: Instagram media first post (header, media, carousel dots, like and comment).

`/develop` must match these layouts for text and image posts. Video player chrome in the shots is layout reference; attaching and playing video stays deferred until the video engine unless the engineer expands AC-5.
