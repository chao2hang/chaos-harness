# Agent Note: 每个 assistant 轮次都会回传 DeepSeek 推理历史

Status: implemented

[English](2026-08-17-deepseek-reasoning-history-passback.md) | 中文

## 问题

思考模式 gateway 可能要求后续 chat-completions 请求携带每个先前 assistant 的思考内容。DeepSeek 适配器会在 Harness 消息中保留推理，但只有同一个 assistant 轮次包含工具调用时，才把它序列化为 `reasoning_content`。因此，普通文本或仅含推理的 assistant 轮次会在下一次请求中丢失协议状态，使严格的 gateway 拒绝原本有效的多轮对话。

## 决策

DeepSeek 适配器会把每个非空的历史推理值序列化为 `reasoning_content`，不受该 assistant 轮次是否还包含可见文本或工具调用影响。仅含推理的轮次仍保留 `content: ""`，因为有些 chat-completions gateway 即使收到 `reasoning_content`，仍要求非 null 的 content 或工具调用。

持久化的 Harness 消息仍是回传值的来源。流式转换把提供方推理记录为 reasoning block，请求序列化则按顺序连接这些 block，不会合成缺失的推理。没有推理的 assistant 消息会省略 `reasoning_content`。

## 考虑过的替代方案

**只对已知会强制检查的 gateway 回传推理。** 适配器接受可配置的 base URL，无法可靠推断其上游行为，而且中间层可能把不同模型路由到不同提供方。条件检测可以保留 token 优化，却会引入只在后续轮次出现的协议失败。

**公开「仅工具调用轮次」与「所有轮次」配置开关。** 这会把协议连续性变成部署调优选择，并允许会话在路由变更后变得不可用。适配器改为对每条思考模式路由采用兼容行为。

**丢弃普通 assistant 轮次后的推理以减少输入 token。** 这样可以节省重复的推理 token，却会移除后续请求可能要求的提供方状态。可靠完成多轮请求优先于这项优化。

## 后果

- 普通文本、工具调用和仅含推理的 assistant 历史都会在协议中保留非空推理。
- 后续思考模式请求可能包含更多输入 token 和更长的 cache 前缀，因为先前推理会继续留在历史中。
- 单元测试固定每种 assistant 内容形式，适配器 mock-server 测试证明直接的往返序列化，headless Loader composition 则证明某个轮次收到的推理会在下一次请求中原样出现。
