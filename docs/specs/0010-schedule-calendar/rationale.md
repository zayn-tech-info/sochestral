# 0010 Rationale: Schedule calendar surface

## Context

Chat, connectors, preview aside, publishing authority, and business profile settings already ship. The main web gap called out in Feature 10 and the master plan is a schedule calendar: see upcoming posts at a glance without messaging channels. SocialMCP already stores schedules and runs the publish worker. Product Postgres must not duplicate that store (spec 0001). Autonomous date range planning (SOC-39) is a later agent behavior that needs this surface to exist first.

Without a decision, `/develop` would guess whether to mirror schedules into Neon, whether Calendar is a drawer or a page, and whether create and full caption edit belong in v1.

## Options considered

### Option 1: Product calendar over SocialMCP schedules (chosen)

Authenticated `/app/calendar` week grid, account sidebar, detail page with live preview, reschedule and cancel via product routes that call SocialMCP. No Neon schedule table.

**Pros**:
- Honors repo split and existing MCP ownership
- Ships the main app gap quickly (Tracer Bullet)
- Reuses connectors account shapes and Feature 14 preview chrome

**Cons**:
- Calendar quality tracks SocialMCP schedule API completeness
- No offline product owned schedule history beyond what MCP returns

### Option 2: Mirror schedules into Neon

Product worker or sync copies MCP schedules into Postgres for calendar reads.

**Pros**:
- Faster reads and richer product queries later

**Cons**:
- Dual source of truth, sync lag, and conflict with 0001
- Larger build before users see value

### Option 3: Schedule drawer only

Expand the existing Soon schedule slide over; no full page.

**Pros**:
- Smaller UI surface

**Cons**:
- Fails the “at a glance” bar and the Google Calendar / Postiz style the engineer wants
- Too small for account sidebar plus week grid plus detail preview

## Rationale

Option 1 wins because Feature 10’s remaining job is an operator surface, not a new system of record. The engineer locked week view, SocialMCP as source, client IANA timezone, dedicated page, account sidebar, and detail with live preview. Mirroring into Neon would reopen the repo split for little v1 gain. A drawer cannot hold the referenced layout. Create from calendar and autonomous planning stay follow ups so this Tracer Bullet can land list → detail → reschedule → cancel end to end.
