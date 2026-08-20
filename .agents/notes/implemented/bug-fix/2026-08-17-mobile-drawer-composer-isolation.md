# Agent Note: Mobile drawer isolates the conversation surface

Status: implemented

English | [中文](2026-08-17-mobile-drawer-composer-isolation.zh.md)

## Problem

Below the phone drawer breakpoint, the sidebar is rendered as an overlay while the conversation remains mounted underneath it. The conversation composer can occupy the viewport bottom and its controls can paint through or remain hit-testable beside the drawer when the sidebar is open. A translucent scrim does not provide the drawer's foreground surface isolation.

## Decision

`AppFrame` marks the frame with `data-drawer-open` while the phone sidebar drawer is open. The frame hides the mounted center column during that state, while the drawer remains visible and interactive above the scrim. The scrim and drawer use a separate high stacking range above fixed conversation controls; the drawer remains opaque through the sidebar fill token. The conversation stays mounted so session and draft state survive opening and closing the drawer.

The phone drawer keeps the existing 280px CSS width. Screenshots captured at device pixel ratio 1.5 therefore show 420 physical pixels; the physical width is not a second CSS sizing rule. This frame-level isolation complements the portaled selector and settings sheets in the [mobile bottom-sheet surfaces](../feature/2026-08-17-mobile-bottom-sheet-surfaces.md) note; it does not replace their owner-level dismissal behavior.

## Alternatives considered

**Raise only the scrim z-index.** Rejected because the scrim is intentionally translucent, so the composer remains visible through it and the mounted center column can still participate in hit testing outside the drawer.

**Unmount the conversation while the drawer is open.** Rejected because unmounting would discard presentation continuity and is unnecessary for a visual isolation requirement.

**Widen the drawer to the physical screenshot width.** Rejected because the apparent 420px width is the 280px CSS drawer rendered at device pixel ratio 1.5; changing the CSS width would make the drawer too wide on ordinary phone viewports.

## Consequences

Opening the phone sidebar temporarily hides all conversation-column painting and interaction, including the composer, while preserving its mounted state. The drawer owns interaction across its 280px CSS panel, and the scrim owns dismissal across the remaining viewport. Closing the drawer restores the conversation without changing its draft, scroll, or session state. The AppFrame behavior test asserts the open marker, and the assembled browser probe verifies that the center column is hidden while drawer settings remain hit-testable.
