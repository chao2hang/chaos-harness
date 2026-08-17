# Agent Note: Versioned GUI welcome onboarding

Status: implemented

English | [中文](2026-07-30-versioned-gui-welcome-onboarding.zh.md)

## Problem

The Settings shell needs deterministic ownership for feature-provided first-run steps so independent dialogs cannot stack. A former product welcome step also introduced a durable acknowledgement field. The dialog is absent from the current product, but the coordinator and existing settings documents remain, so the live design must distinguish active onboarding behavior from compatibility data.

## Decision

**The Settings shell coordinates ordered steps.** `settings.onboarding` remains a root-scoped list, and `ui-settings` projects its entry ids and order into one coordinator that mounts only the first incomplete step. The active registrant receives `complete()` and `openSection(id)`; no later step mounts until ownership transfers. `ui-settings-models` currently registers only the conditional DeepSeek credential step at order `0`.

**The welcome-step decision is superseded.** The [internal-testing dialog removal](../simplification/2026-08-17-remove-internal-testing-dialog.md) removes the `welcome-notice` registration, component, copy, acknowledgement store, and browser behavior. No local or remote browser displays or acknowledges product-stage prose.

**The durable `ui-onboarding` section is compatibility-only.** The Host registers `welcomeNoticeVersion` under the active `$DSH_HOME/settings.yaml` so documents written by the former step remain valid. API Proxy does not expose the namespace, and no browser plugin reads, writes, or subscribes to it.

**Visible onboarding owns its modal contract.** The current DeepSeek credential step renders through body-portaled `OnboardingModal`, and the underlying app root stays inert only while that dialog is visible. The shell renders no wrapper while the step loads its private facts. Explicit actions transfer coordinator ownership; Escape and mask clicks do not complete the step.

## Alternatives considered

**Remove the coordinator with the welcome dialog.** Rejected because the conditional credential form remains feature-owned onboarding, and the shell still needs one generic ordering and completion mechanism for current and future steps.

**Delete the historical settings section.** Rejected because existing Harness homes may contain `ui-onboarding.welcomeNoticeVersion`; retaining its schema keeps those documents valid without exposing a browser capability.

**Keep the welcome dialog in browser local storage.** Rejected because product-stage prose does not justify any completion state, and browser-profile persistence would diverge from Harness-profile ownership.

**Let each feature mount an independent modal.** Rejected because independently true conditions could stack dialogs and compete for focus and app-root inert ownership.

## Consequences

A fresh profile has no welcome declaration. When no provider is usable and the official DeepSeek credential can be written, the credential dialog is the first and only shipped onboarding step; ready or unrepairable deployments render no onboarding chrome. Existing welcome acknowledgement data remains parseable but inert. Focused registration and React tests pin coordinator ordering, conditional transfer, visible-only modal behavior, and HMR cleanup, while the real Chromium scenario asserts the notice is absent and the credential write remains secret-safe.
