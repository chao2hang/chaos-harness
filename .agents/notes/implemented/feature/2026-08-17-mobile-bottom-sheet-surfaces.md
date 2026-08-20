# Agent Note: Mobile bottom-sheet surfaces for settings and selectors

Status: implemented

English | [中文](2026-08-17-mobile-bottom-sheet-surfaces.zh.md)

## Problem

The Web client’s desktop overlays retained desktop geometry on phone-width viewports. The Settings panel kept a fixed side navigation rail beside a narrow content column, so Chinese copy wrapped one character per line. Composer selectors remained anchored popovers, which left model, permission, command, context, and workspace choices cramped or clipped and gave touch users no sheet-sized target.

## Decision

**Phone-width settings and selection flows use an opt-in bottom-sheet presentation while short desktop actions remain popovers.** At `max-width: 600px`, the shared Modal aligns to the bottom and uses safe-area-aware viewport sizing, SettingsRoot stacks its navigation above content with a horizontally scrolling 44px navigation row, and the options column remains the only vertical scrollport. SettingsRoot’s full-viewport layer is portaled to `document.body`, so the transformed mobile sidebar cannot constrain it. Shared Modal roots use z-index `1050`, above the SettingsRoot layer at `1000`; portaled menus use `1100`, so model-discovery and confirmation dialogs opened from a settings sheet remain visible and hit-testable without displacing menus. ModelSelect, PermissionSelect, PopupSelectView, and ContextMeter render a fixed sheet with a dismissible mask; their rows and controls use at least 48px touch targets. The shared Menu primitive exposes `mobileSheet` for anchored consumers such as WorkspacePicker, so portaled menus and their masks cover the full viewport without changing the default popover behavior.

Every sheet keeps its owner’s existing interaction semantics: Escape and outside dismissal still call the owner close path, selection callbacks remain unchanged, and the sheet’s internal list scrolls instead of moving the page. Safe-area insets apply to the sheet edges and bottom padding, while `100dvh` is preferred when supported. The desktop layout and non-opted-in Menu consumers remain unchanged.

This decision extends the existing composer width and control-row rules ([shared width axis](2026-08-04-web-composer-shared-width-axis.md)) and keeps the context meter and workspace picker as their owning packages describe them ([context meter](2026-08-05-composer-context-meter-breakdown.md), [workspace picker](2026-08-07-workspace-picker-composer-entry.md)). RiskConfirmation continues to use the shared Modal rather than becoming a second confirmation surface ([full-access confirmation](2026-07-31-gui-full-access-confirmation.md)).

## Alternatives considered

**Keep the desktop two-column Settings panel on phones.** Rejected: the fixed 188px navigation rail leaves the active content column too narrow for readable localized text and makes the panel unusable without horizontal recovery.

**Make every Menu a bottom sheet on mobile.** Rejected: short contextual actions need to stay adjacent to their trigger, and changing all menus would make row actions unnecessarily modal. Consumers opt in through `mobileSheet` only when the list is a selection flow.

**Choose the presentation with JavaScript viewport listeners.** Rejected: the visual breakpoint is a CSS concern; media queries avoid listener lifetimes and keep server, test, and browser markup identical.

## Consequences

Phone settings navigation becomes a horizontal scroll row rather than a permanent side rail, so long section labels remain readable and the content receives the full sheet width. Portaling the settings layer and portaled Menu masks prevents drawer and page stacking contexts from putting other surfaces above an active selection. Selection flows gain a mask, safe-area clearance, and larger targets, at the cost of covering the conversation while a choice is active. The shared Menu API grows one opt-in presentation flag, while existing consumers keep their desktop and mobile popover behavior unless they explicitly select the sheet. Focus and keyboard behavior remain owned by each existing component and are not replaced by a generic gesture controller.

Focused coverage for the changed components and the body-portal regression passes; the full Web replay remains dependent on the repository’s assembled browser fixtures and host environment.
