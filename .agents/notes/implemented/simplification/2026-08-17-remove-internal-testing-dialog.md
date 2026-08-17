# Agent Note: Remove the internal-testing dialog

Status: implemented

English | [中文](2026-08-17-remove-internal-testing-dialog.zh.md)

## Problem

The Web GUI opened first-run sessions with a blocking, versioned internal-testing statement whose only action was Continue. The text asked for no consent and exposed no repair action, yet it delayed both the usable application and the actionable DeepSeek credential form. Supporting that statement also required a copy-version constant, acknowledgement store, loopback settings writes, a process-local remote fallback, invalidation handling, and dedicated browser coverage solely to suppress the same text later.

## Decision

**The assembled Web GUI registers no internal-testing statement.** `ui-settings-models` contributes only `deepseek-official` to `settings.onboarding`; the `welcome-notice` registration, component, store, copy, locale keys, styles, remote-browser scenario, and ARIA snapshot are absent. `OnboardingModal` remains the visible wrapper for the actionable credential step.

**The historical acknowledgement remains parseable but is not a browser capability.** The Host keeps the `ui-onboarding.welcomeNoticeVersion` schema so an existing `settings.yaml` document remains valid. API Proxy does not allowlist that namespace, and no client reads, writes, or subscribes to it. The field may remain on disk as inert compatibility data.

This decision partially supersedes the display and acknowledgement portions of [versioned GUI welcome onboarding](../feature/2026-07-30-versioned-gui-welcome-onboarding.md) and [shared-modal product onboarding](../feature/2026-08-13-shared-modal-product-onboarding.md). Their onboarding coordinator and credential-modal decisions remain active. The separate [first-run beta notice removal](2026-08-13-remove-first-run-beta-notice.md) continues to own the absence of the older telemetry prompt and full-viewport presentation.

## Alternatives considered

**Reword or shorten the statement.** Rejected because release-stage context still has no required first-run action, and a mandatory acknowledgement remains friction regardless of copy length.

**Make the statement dismissible or show it only once.** Rejected because either choice retains state, remote/loopback divergence, and UI machinery for optional prose that can live in documentation or release communication.

**Delete the `ui-onboarding` settings schema and stored field.** Rejected because existing settings documents may contain the field; retaining the schema preserves document validity without exposing product behavior.

**Remove all first-run onboarding.** Rejected because the DeepSeek credential dialog identifies a repairable condition and writes the missing credential through the existing secret boundary.

## Consequences

A page never renders the `内测声明` / `Internal Testing Notice` dialog. A deployment with no usable provider may still show the DeepSeek API-key dialog immediately; a ready or unrepairable deployment shows no onboarding modal. No shipped browser sends a welcome acknowledgement over the settings wire, while existing acknowledgement data remains harmless on disk. The assembled Chromium scenario asserts the notice is absent before credential entry and after reload, and the client registration test pins a single onboarding occupant.
