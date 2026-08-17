# Agent Note: Remove the first-run beta notice

Status: implemented

English | [中文](2026-08-13-remove-first-run-beta-notice.zh.md)

## Problem

Every GUI first launch opened with a full-viewport internal-test statement (内测声明): internal-beta framing plus instructions for enabling Session Log upload through `DSH_TELEMETRY_MODE`. Session telemetry already resolves to `DISABLED` when its mode is unset ([telemetry default-off](../feature/2026-08-10-telemetry-default-off.md)), so the only onboarding content about telemetry was a prompt explaining how to turn it on, and the internal-test framing itself must not ship in a release build.

## Decision

The assembled product contains no first-run internal-test statement. Neither `ui-settings-general` nor `ui-settings-models` registers a welcome step; the notice component, acknowledgement store, copy owner, locale keys, and browser scenarios are absent. The Host retains the `ui-onboarding.welcomeNoticeVersion` schema solely so existing settings documents remain valid, while API Proxy and browser plugins do not expose or consume it. The [internal-testing dialog removal](2026-08-17-remove-internal-testing-dialog.md) owns removal of the later shared-modal restoration. Telemetry opt-in remains an explicit deployment environment choice documented in the [CLI reference README](../../../../apps/cli/reference/README.md).

## Alternatives considered

**Keep the notice and only drop its telemetry paragraph.** Rejected: the internal-test framing is what a release must not present, and a mandatory first-run interstitial with no material statement left is pure friction.

**Ask for upload consent instead (a versioned consent step).** Rejected for this release: a first-run question about enabling upload is still a telemetry prompt. A future consent flow can register through the unchanged `settings.onboarding` seam and use a fresh versioned field for re-acknowledgement.

**Deregister the `ui-onboarding` namespace as well.** Rejected: existing settings documents already carry the section, and the settings seam validates stored documents against registered namespaces; keeping the registration keeps those documents valid at no cost.

## Consequences

No first-run statement or telemetry prompt blocks the GUI. The conditional credential dialog remains because it repairs a missing provider credential, and the historical `welcomeNoticeVersion` field remains inert compatibility data rather than a completion mechanism.
