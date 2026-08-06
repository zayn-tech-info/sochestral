# Sochestral product design

**Source**: AI Operating System for social media (aligned with auth)

## Character

Sochestral is a professional AI operating system for social media teams. Magenta brand, Imprima typography, layered soft shadows, and calm whitespace continue from login into the product.

## Composition

Two columns by default: a compact icon rail and a wide main workspace. When a conversation has a draft or live publish result, chat gains a conditional right hand live preview aside (platform true post chrome). Notifications, connectors, schedule, analytics, and activity still open as slide over panels.

## Experiences

**AI Workspace (`/app/workspace` and `/app/chat/[id]`)** is the default product surface. `/app` redirects here. The composer is the hero; recent chats and prompt pills sit below.

## Navigation

Icon rail by default; expands on hover/focus to show labels. Wired: AI Workspace, Connected Accounts / Settings. Calendar, Scheduled Posts, Drafts, Analytics, Brand Assets stay Soon until APIs exist. Sign out lives in the rail footer.

## Header

Slim floating bar: workspace switcher (Soon), live sync, Quick Create, notifications drawer, profile/connectors drawer. No permanent global search—the composer is the creation surface.

## Brand

Primary `#f211b6`, soft `#ff4dce`, deep `#c20e92`, background `#fafafc`, text `#0f172a`. Tokens in `globals.css` on `.app-frame` / auth page.

## Motion

Quiet Motion feedback. Drawer enter/exit restrained. Honor reduced motion.

## Build mandate

Content first, chrome second. Progressive disclosure over permanent panels. Never invent live data for Soon surfaces. Keep chat streaming, connectors, review, and publishing mode wired.
