# Agent Note: 可见步骤自行持有首次使用引导框架

Status: implemented

[English](2026-08-06-onboarding-step-owned-takeover-chrome.md) | 中文

## 问题

设置外壳曾在某个首次使用引导条目成为当前项时立即挂载引导框架。功能步骤必须先加载私有就绪事实，期间会返回 `null`；由外壳持有框架会先画出空白阻断层，并把 `#root` 设为 inert，持续一次 settings 或 credentials 往返，直到已经满足的步骤完成。

当前 DeepSeek 凭据步骤仍有同样的时序要求：Models 联接证明存在可写但缺失的凭据之前，它不得绘制或阻断产品。

## 决策

**可见引导框架属于步骤，不属于外壳。** `SettingsRoot` 保留协调器——有序账本投影、每次挂载一个步骤、本地完成集合，以及 `stepId`／`complete`／`openSection` owner props——但渲染当选条目时不附带 portal、遮罩或 inert 效果。`settings.onboarding` slot 契约要求注册方持有自己的可见外层，并在私有事实未决时返回 `null`。

`DeepSeekOnboardingDialog` 只在 `credential-missing` 分支中使用 `OnboardingModal`。该外层把 ui-primitives `Modal` portal 到 body，并在且仅在自身挂载期间保持 `#root` 为 inert。加载中、已就绪、不可用或提供方缺失的分支都不渲染任何内容，因此应用在解析就绪状态期间保持可见且可交互。

## 曾考虑的替代方案

**只在就绪状态解析后注册步骤。** 不采用：这样会把联接与响应式注册生命周期移入每个插件的 apply 路径。步骤自行渲染可以保留一个稳定 slot 贡献，又不会发布空白框架。

**把 `settings.onboarding` 改成 chain 并增加外部完成 store。** 不采用：selector 只能判定 owner props，功能私有就绪状态仍需在组件内解析，因此 chain 会增加路由机制，却无法消除时序问题。

**在渲染点探测 slot 输出为空。** 不采用：无论最终组件结果如何，`renderSlot` 都会返回 outlet 元素。探测已经提交的空 DOM 需要先绘制再撤回，无法保留 paint 前保证。

## 后果

已挂载但尚未判定的引导步骤会让应用保持可见且可交互。真正可修复的凭据缺失状态会在联接解析后显示内容完整的弹窗，而不是先显示空白展示层。未来的引导注册方必须自行提供可见弹窗或外层。

## 测试

`packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` 固定已挂载步骤渲染空内容时外壳保持无包装。`packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx` 固定仅可见时挂载弹窗及其 inert 所有权。`apps/web/tests/onboarding-deepseek-config.e2e.ts` 在已配置状态重载时扣住全部 `settings.describe` 响应，并每 8 ms 采样页面，证明判定窗口内不出现凭据弹窗且 `#root` 从不变为 inert。
