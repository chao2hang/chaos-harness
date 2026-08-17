# Agent Note: 共用弹窗的产品引导

Status: implemented

[English](2026-08-13-shared-modal-product-onboarding.md) | 中文

## 问题

DeepSeek 凭据提示曾先把首次使用的用户带进「设置」，之后才能填写让随产品提供的模型可用所需的唯一值。该提示需要由功能自身的就绪状态与变更逻辑持有弹窗展示，而不是把浮层策略加入设置外壳，也不能复制一份凭据表单。

## 决策

**由同一个既有 client Cordis 插件持有已发布的凭据步骤。** `ui-settings-models` 在 `settings.onboarding` 中以顺序 `0` 注册 `deepseek-official`。外壳每次只挂载一个未完成条目，因此该步骤可以与其他功能所有的引导共存，而无需把提供方策略硬编码进外壳。

**可见步骤自行持有一个弹窗组件。** `OnboardingModal` 包装既有 ui-primitives `Modal`，提供标题与内容布局，并只在可见期间持有 `#root` 的 inert 状态。Escape 和遮罩点击不会静默完成引导。步骤仍在加载私有事实时返回 `null`，因此不会绘制或阻塞界面。

**内测声明已被取代。** [移除内测声明弹窗](../simplification/2026-08-17-remove-internal-testing-dialog.md)删除了此前的 `welcome-notice` 注册项与确认行为。`OnboardingModal` 当前只有一个生产消费方：凭据弹窗。Host 仅为维持设置文档有效性而保留历史确认 schema。

**凭据弹窗复用既有编辑器与写入边界。** Models 联接负责判断是否已有任意可用提供方。当 DeepSeek 官方引用可写但缺失时，`ProviderEditor` 以仅凭据模式渲染在弹窗中。它校验密钥并调用既有 `credentials.set`，不会修改提供方设置。「保存并继续」会等待写入与就绪状态刷新；「稍后配置」只完成协调器当前这一轮。

## 曾考虑的替代方案

**为凭据引导单设 client 插件。** 不采用：Models 插件持有提供方就绪状态、编辑器、文案、失效刷新和配置 UI；拆分弹窗会复制这些事实，或者新增跨插件 API。

**把凭据逻辑移入新的 Host API。** 不采用：既有 settings、提供方目录与 credentials 契约已经能表达所需状态与写入；新增 endpoint 只会扩大范围，不会增加用户能力。

**继续跳转到 Models。** 不采用：首次使用唯一必填的是密钥，既有编辑器可以安全暴露这项写入，无需再把用户送进第二个对话框。

**在前面保留产品阶段说明弹窗。** 移除决策不采用该方案，因为它没有必需的用户操作，并会推迟可修复的凭据步骤。

**使用此前占满视口的展示层。** 不采用：ui-primitives modal 已能提供凭据表单所需的 portal、遮罩、无障碍与焦点行为，无需替换整个视口。

## 后果

全新 profile 绝不会看到内测声明。只有在没有任何可用提供方且官方凭据可写时，才会看到行内 DeepSeek 密钥弹窗。secret 仍以只写方式存入 `.credentials.yaml`，已就绪或不受支持的部署在加载就绪状态时不会渲染任何引导框架。Models 包持有提供方配置与凭据引导展示，设置外壳则继续作为通用协调器。
