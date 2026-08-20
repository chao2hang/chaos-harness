# Agent Note: Phone touch affordances and viewport clamping

Status: implemented

English | [中文](2026-08-19-phone-touch-affordances-and-viewport-clamping.zh.md)

## Problem

A hands-on pass over the Web GUI at 320/390/414 CSS px found defects that the sheet work ([bottom-sheet surfaces](../feature/2026-08-17-mobile-bottom-sheet-surfaces.md)) did not reach, because they live in the ordinary chrome rather than in the overlays.

Three classes of defect appeared. **Rows overflowed the viewport and lost their content.** `ContextInjectionRow`'s producer label declared `text-overflow: ellipsis` under `flex: none`, so it could not shrink and ran 82px past the column edge; the message clock ran 157px past it, because `@media (hover: hover)` keeps the full `clock · duration · TTFT · throughput` reading permanently visible on a touch device while its row had no wrap and no shrinkable child. The session stats popover kept the desktop `right: 0` anchor, so a 270px panel hanging off a pill near the left edge clipped its own left column off-screen. **Hover-only affordances were unreachable.** The workspace tree revealed rename, fork, and archive on `:hover` alone, which a touch screen never produces, and the hover preview card opened on tap and painted off-screen to the right of the drawer. **The phone drawer behaved like a desktop column**: opening a session left it covering the conversation it had just selected, and its scrim used `--dsw-alias-bg-mask-drop`, which is white at 70% in the light theme and therefore invisible over a white page.

Two layout faults compounded these. The hero state reused the session view's phone rule, whose growing `.sessionBody` became an empty box the height of the free space and pinned the hero under ~590px of blank column. Across the chrome, controls drawn for a mouse — 28px composer chips, a 34px send circle, 32/34px tree rows, 28px header circles, 27px view tabs — sat below every touch-target minimum.

## Decision

**Phone rules restate the geometry a touch pointer needs, and every clamp is recounted against the control size it was derived from.**

Sizing is gated on the existing phone drawer breakpoint (`max-width: 640px`, `columns.ts SIDEBAR_DRAWER_BREAKPOINT`) so one width decides drawer, tree, and composer together; the settings sheet keeps its own 600px breakpoint. Composer circles become 40px with a 44px send, tree and header controls 40px, tree rows 44px, and the view tabs grow through padding so `.tab::after` keeps pinning the underline. Row gaps drop to 8px and `.tools` stops shrinking, so the model label — the one control with an ellipsis — absorbs the deficit instead of the mode chips collapsing to zero width; below 360px the trailing group takes its own line rather than degrading the model chip to a bare chevron.

Reveal rules keyed on hover move to `@media (hover: none)`, which states the actual condition: the tree shows its row verbs permanently and drops the relative time, reproducing the desktop hover composition, and `HoverCard` does not display at all. `HoverCard` also flips to the anchor's left and clamps into the viewport when the preferred side does not fit, so a narrow desktop window cannot push it off-screen either.

`ILayout` gains `dismissDrawer()`, and the navigating verbs — the shell's New Session, the browser's session open, start, and fork — call it. The layout store learns `drawer` as a pure mirror of AppFrame's phone reading so the action can distinguish a covering drawer from a shared column; crossing that breakpoint still preserves `narrowExpanded`, which `setNarrow` alone clears. Both drawer scrims take `--dsw-alias-bg-mask-1` with `--dsw-mask-blur`, the dimming every other full-viewport dismissible layer already uses.

The stats popover becomes a viewport-pinned sheet at phone width, matching the model, permission, and context-meter selectors, and takes the shared Modal z-index tier so the composer's selector roots — which hold `1000` at this width even while closed — cannot paint through it. The hero's `.sessionBody` stops growing when the composer seat holds the hero, restoring `.scrollBody`'s own centring. Theme cubes share one row instead of stacking, and the settings close button leaves the flow for the panel corner so the phone sheet spends one row on its title instead of three.

## Alternatives considered

**Suppress the hover card in JavaScript with `matchMedia('(hover: hover)')`.** Rejected: jsdom answers `matches: false` for every query, so the component's own specs would stop rendering the card they assert. The presentation rule belongs in CSS, where the existing `MessageIconActions` hover gate already lives.

**Truncate the message clock instead of letting its row wrap.** Rejected alone: truncation is the guaranteed floor, but wrapping preserves the full run-time reading, which is the only place a touch user sees it. The row does both — wrap first, ellipsis as the backstop — so no width can overflow.

**Keep the hero docked to the bottom on phones.** Rejected: the composer is already within thumb reach in the centred position, and the docked form left the top two thirds of the column empty, which reads as a failed render rather than a layout.

**Scale every control through a root font-size or a token.** Rejected: the sizes are per-component figma geometry with hardcoded companions (`.headerActions` caps the collapsed cluster at the 28px pair's exact width), so a global scale would move drawn chrome without fixing the counted clamps.

## Consequences

Phone chrome is taller: the composer row, tree rows, and drawer header each gain roughly 12px, and the settings panel spends one row on its header instead of three, which more than repays it. The `(hover: none)` tree permanently shows its ellipsis button and hides the relative time, so a touch user trades the timestamp for reachable row verbs. `HoverCard` renders nothing on touch, so its content must never be the only place a fact appears — the row title and the copy action remain independently available.

`ILayout` grows one method; every implementation and test fake supplies it, and `ui-workspace` gains a `layout` service edge it did not previously declare. The drawer now closes on navigation, so a phone user who wants to open several sessions reopens it each time.

Two clamps remain counted by hand — the collapsed search slot and the header action cluster — and a future control-size change must recount them; they are asserted at their phone breakpoint in `browser-styles.client.spec.ts` so a drift fails there rather than in a screenshot.

## Verification

`pnpm run test:gui` (274 files) passes. `browser-styles.client.spec.ts` gained at-rule-aware selector reading — a conditional override no longer merges into the base rule it overrides — plus assertions for the touch row heights, the header control sizes, and the `(hover: none)` reveal. `apply.client.spec.ts` in `ui-workspace` and `ui-sidebar` assert that each navigating verb dismisses the drawer. The audit itself was a real chromium at 320/390/414 against a `dsh web` instance over cloned session data, checking every surface for elements crossing the viewport edge and for interactive boxes under 36px; both reports are clean apart from the trajectory table's inner spans, which their parents already ellipsize.
