# Agent Note: Onboarding chrome belongs to the visible step

Status: implemented

English | [中文](2026-08-06-onboarding-step-owned-takeover-chrome.zh.md)

## Problem

The Settings shell once mounted onboarding chrome as soon as an entry became active. A feature step must first load private readiness facts and returns `null` while that work is in flight; shell-owned chrome therefore painted an empty blocking layer and made `#root` inert for one settings or credential round trip before an already-satisfied step completed.

The current DeepSeek credential step has the same timing requirement: it must not paint or block the product until the Models join proves that a writable credential is missing.

## Decision

**Visible onboarding chrome belongs to the step, not the shell.** `SettingsRoot` keeps the coordinator — ordered ledger projection, one mounted step, local completion set, and `stepId`/`complete`/`openSection` owner props — but renders the selected entry without a portal, mask, or inert effect. The `settings.onboarding` slot contract requires registrants to own their visible wrapper and return `null` while private facts are undecided.

`DeepSeekOnboardingDialog` wraps only its `credential-missing` branch in `OnboardingModal`. That wrapper body-portals the ui-primitives `Modal` and holds `#root` inert for exactly its mount lifetime. Loading, ready, unavailable, or absent-provider branches render nothing, so the application remains painted and interactive while readiness resolves.

## Alternatives considered

**Register a step only after readiness resolves.** Rejected because the join and reactive registration lifecycle would move into each plugin's apply path. Step-owned rendering preserves one stable slot contribution without publishing empty chrome.

**Convert `settings.onboarding` to a chain with an external completion store.** Rejected because selectors can judge only owner props; feature-private readiness would still resolve inside components, so the chain would add routing machinery without removing the timing problem.

**Detect empty slot output at the render site.** Rejected because `renderSlot` returns an outlet element regardless of the eventual component result. Detecting empty committed DOM would require a paint-then-retract transition and cannot preserve the pre-paint guarantee.

## Consequences

A mounted but undecided onboarding step leaves the application visible and interactive. A genuinely repairable missing-credential state presents a complete modal after the join resolves, rather than an empty stage before it. Future onboarding registrants must provide their own visible modal or surface wrapper.

## Testing

`packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` pins the bare shell behavior when a mounted step renders nothing. `packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx` pins visible-only modal and inert ownership. `apps/web/tests/onboarding-deepseek-config.e2e.ts` holds every `settings.describe` response during a configured reload and samples the page every 8 ms, proving no credential dialog appears and `#root` never becomes inert during the decision window.
