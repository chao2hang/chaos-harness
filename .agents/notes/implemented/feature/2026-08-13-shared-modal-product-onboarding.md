# Agent Note: Shared-modal product onboarding

Status: implemented

English | [中文](2026-08-13-shared-modal-product-onboarding.zh.md)

## Problem

The DeepSeek credential prompt redirected first-time users into Settings before they could enter the one value needed to make the shipped provider usable. The prompt needs dialog presentation that stays with the feature's readiness and mutation logic rather than adding overlay policy to the Settings shell or introducing a duplicate credential form.

## Decision

**One existing client Cordis plugin owns the shipped credential step.** `ui-settings-models` registers `deepseek-official` at order `0` in `settings.onboarding`. The shell mounts one incomplete entry at a time, so this step remains compatible with other feature-owned onboarding without hardcoding provider policy.

**The visible step owns one modal component.** `OnboardingModal` wraps the existing ui-primitives `Modal`, supplies title and content geometry, and owns `#root` inert for exactly its visible lifetime. Escape and mask clicks do not silently complete onboarding. A step still loading private facts returns `null`, so it paints and blocks nothing.

**The internal-testing statement is superseded.** The [internal-testing dialog removal](../simplification/2026-08-17-remove-internal-testing-dialog.md) removes the former `welcome-notice` registration and acknowledgement behavior. `OnboardingModal` now has one production consumer: the credential dialog. The Host keeps the historical acknowledgement schema only for settings-document validity.

**The credential dialog reuses the existing editor and write boundary.** The Models join decides whether any provider is usable. When the official DeepSeek reference is writable and missing, `ProviderEditor` renders in credential-only mode inside the modal. It validates the key and calls the existing `credentials.set`; it does not mutate provider settings. Save and continue waits for the write and refreshed readiness, while Configure later completes only the current coordinator pass.

## Alternatives considered

**A separate client plugin for credential onboarding.** Rejected because the Models plugin owns provider readiness, the editor, copy, invalidation, and configuration UI; splitting the dialog would either duplicate those facts or create a new cross-plugin API.

**Move credential logic into a new Host API.** Rejected because the existing settings, provider-directory, and credential contracts already express the required state and write. A new endpoint would widen scope without changing user capability.

**Keep navigation into Models.** Rejected because the key is the only required first-run field, and the existing editor can expose that write safely without sending the user through a second dialog.

**Keep product-stage prose in a preceding modal.** Rejected by the removal decision because it has no required user action and delays the repairable credential step.

**Use the former full-viewport stage.** Rejected because the ui-primitives modal provides the portal, mask, accessibility, and focus behavior the credential form needs without replacing the whole viewport.

## Consequences

A fresh profile never sees an internal-testing statement. It sees an inline DeepSeek key dialog only when no provider is usable and the official credential is writable. Secrets remain write-only in `.credentials.yaml`, and already-ready or unsupported deployments render no onboarding chrome while readiness loads. The Models package owns the provider configuration and credential-onboarding presentation, while the Settings shell remains a generic coordinator.
