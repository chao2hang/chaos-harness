# Agent Note: DeepSeek reasoning history is passed back on every assistant turn

Status: implemented

English | [中文](2026-08-17-deepseek-reasoning-history-passback.zh.md)

## Problem

Thinking-mode gateways may require every prior assistant reasoning value in a later chat-completions request. The DeepSeek adapter retained reasoning in Harness messages but serialized it as `reasoning_content` only when the same assistant turn contained tool calls. A plain text or reasoning-only assistant turn therefore lost protocol state on the next request, allowing strict gateways to reject an otherwise valid multi-turn conversation.

## Decision

The DeepSeek adapter serializes every non-empty historical reasoning value as `reasoning_content`, independent of whether that assistant turn also carries visible text or tool calls. Reasoning-only turns retain `content: ""` because some chat-completions gateways require non-null content or tool calls even when `reasoning_content` is present.

The durable Harness message remains the source of the passback value. Streaming translation records provider reasoning as a reasoning block, and request serialization joins those blocks in order without synthesizing missing reasoning. Assistant messages with no reasoning omit `reasoning_content`.

## Alternatives considered

**Pass reasoning back only for gateways known to enforce it.** The adapter accepts configurable base URLs whose upstream behavior cannot be inferred reliably, and an intermediary may route different models to different providers. Conditional detection would preserve a token optimization at the cost of protocol failures that appear only on later turns.

**Expose a tool-call-only versus all-turns configuration switch.** This would make protocol continuity a deployment tuning choice and permit sessions that become unusable after a route change. The adapter instead uses the compatible behavior for every thinking-mode route.

**Discard reasoning after plain assistant turns to reduce input tokens.** This saves repeated reasoning tokens, but it removes provider-issued state that a later request may require. Successful multi-turn dispatch takes precedence over that optimization.

## Consequences

- Plain-text, tool-call, and reasoning-only assistant history all preserve non-empty reasoning on the wire.
- Later thinking-mode requests may contain more input tokens and a longer cache prefix because prior reasoning remains in history.
- Unit coverage pins each assistant content form, the adapter mock-server test proves direct round-trip serialization, and the headless Loader composition proves that reasoning received in one turn appears unchanged in the next request.
