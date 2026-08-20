# Agent Note: Non-widening sandbox_permissions is ignored

Status: implemented

English | [中文](2026-08-17-ignore-non-widening-sandbox-permissions.zh.md)

## Problem

Confining compositions advertise `sandbox_permissions` on every mutating tool because schemas are registry-global. A session already at `workspace-write` or `danger-full-access` still sees those fields. Models cargo-cult `sandbox_permissions=workspace-write` onto ordinary writes and bash calls. The previous execution rule failed that ask with `sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode` and never ran the operation. Under `approval/policy: never`, a genuine widening ask is also auto-rejected, so the only working path is a call that omits the field. Goal workers that kept attaching the field therefore could not edit or run commands even when standing policy already allowed the work.

## Decision

A `sandbox_permissions` value that is not strictly wider than the call's standing mode is redundant. `validateEscalationArgs` skips pairing for that ask, `approveEscalation` returns `undefined` without prompting, and bash, pwsh, and filesystem mutations run under the standing `ctx.sandboxPolicy` mode. Justification is required only for a strictly wider ask. An orphan `justification` without `sandbox_permissions` still fails. A strictly wider ask still goes through `ctx.approval` before anything executes.

The schema enum stays the closed target set. Cutting it to modes wider than the composition default would strand a session switched narrower than that default.

This refines the [sandbox escalation rule](../feature/2026-07-06-sandbox.md): fail-closed remains for real widening that cannot be approved; it no longer applies to a non-widening field.

## Alternatives considered

**Keep failing non-widening asks.** That preserves a loud signal that the field was unused, but models treat the error as another reason to retry with the same field. Standing policy already grants the access the field named or more.

**Hide `sandbox_permissions` when standing policy is already `danger-full-access`.** Tool schemas are registry-global and do not vary per session. A session can also switch narrower after load, and that session still needs the fields.

**Treat a narrower ask as a one-call downgrade.** The user already set the standing mode. Silently running under a tighter fence than the session selected would hide that grant and reintroduce denials the user turned off.

## Consequences

- Ordinary write, edit, bash, and pwsh calls succeed when the model attaches a non-widening `sandbox_permissions`, including `workspace-write` under `danger-full-access`.
- A real widening ask still prompts (or fails closed under `never`) and still requires a non-empty justification.
- Unit coverage pins `isStrictlyWider`, pairing skip, `approveEscalation` returning `undefined`, and bash, pwsh, and filesystem stamps that keep the standing mode without an approval request.
