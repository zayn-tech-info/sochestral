# Sochestral product design

**Source**: image reference and approved spec 0004

## Character

Sochestral feels like a quiet working studio. Warm neutral space, compact controls, and restrained violet accents keep the product calm and useful rather than decorative.

## Composition

The desktop workspace uses a compact 248 pixel navigation rail and one centered work area. The conversation owns the page. Its transcript scrolls independently while the composer stays pinned to the bottom of the chat viewport. Full connector state and guidance live only in Settings. A focused review modal may show the eligible destination accounts needed for the current publish.

On small screens the conversation stays primary. Navigation becomes a sheet that opens over the workspace.

## Components

Surfaces use white on warm gray with subtle borders and small corners. Buttons use clear text and familiar Lucide icons only where the icon explains an action. Status always uses a word as well as color. Large empty state cards, decorative AI marks, gradients, glows, and oversized icon containers are not used in the product workspace.

Each review group leaves a compact summary launcher in the transcript and opens in one focused modal. Each platform draft uses one compact white editing surface, visible validation, an explicit save action, and one quiet group approval footer. The modal scrolls inside the viewport and keeps its heading and group action visible. Successful drafts become read only. Unknown drafts expose only status checking.

Tool activity sits slightly below the assistant response as a small muted disclosure aligned to the left edge of the response column. Its closed state shows only the action count and a quiet status icon. Detailed tool logs remain hidden until the user expands the disclosure.

Sending a message adds the user bubble to the transcript immediately. While the response is being prepared, the assistant side shows only its normal label and one small progress icon. Do not show a separate working notice or explanatory loading card.

An explicit send always moves the transcript to the newly sent message. Later incoming content follows only while the reader remains near the bottom, so reading older messages is never interrupted.

## Typography

Product headings, body text, and controls use Inter. Headings stay at 28 pixels or less. Body copy stays between 14 and 16 pixels and uses a comfortable reading width.

## Motion

Motion is polished, quiet, and functional. Shared Motion configuration keeps interaction feedback consistent across the workspace and login.

Hover and press feedback uses 140 to 180 milliseconds. Route and state entrances use 180 to 260 milliseconds, no more than 6 pixels of travel, and the standard ease out curve. Mobile navigation uses one restrained spring and completes its exit before the dialog closes. No normal product interaction exceeds 300 milliseconds or delays its action.

Buttons press slightly, prompt pills lift by 1 pixel, and the active primary navigation surface moves between destinations. Messages, progress, errors, OAuth results, connector rows, login content, and tool disclosure animate only when their state changes. Looping motion is reserved for genuine progress.

The browser reduced motion preference removes transforms, springs, and staggered delays while preserving state changes, opacity feedback, visible focus, and accessible dialog and disclosure behavior.

## Assets

The product uses a simple typographic brand mark and Lucide interface icons. It does not need photography or decorative illustration.

## Token source

All visual values live in `src/app/globals.css`.

## Responsive behavior

The base layout is one column. The left navigation appears at 1024 pixels. No right context rail appears at any width. Review becomes a full height modal on narrow screens. The conversation composer remains visible above the safe area. Interactive targets remain at least 44 pixels.

## Build mandate

Keep the chat surface dominant. Prefer whitespace and hierarchy over decoration. Never show a blank state without a useful next action. Never repeat connector state outside Settings. Never show controls that the current backend cannot honor.
