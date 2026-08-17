# Agent Note: 移除内测声明弹窗

Status: implemented

[English](2026-08-17-remove-internal-testing-dialog.md) | 中文

## 问题

Web GUI 会在首次使用时显示一个阻断式、按版本管理的内测声明，唯一操作是「继续」。这段文字既不征求同意，也不提供任何修复操作，却会推迟用户进入可用应用以及可采取行动的 DeepSeek 凭据表单。为了之后不再显示同一段文字，产品还需维护文案版本常量、确认 store、回环 settings 写入、远程浏览器的进程内回退、失效事件处理，以及专门的浏览器覆盖。

## 决策

**组装后的 Web GUI 不注册任何内测声明。** `ui-settings-models` 只向 `settings.onboarding` 提供 `deepseek-official`；`welcome-notice` 注册项、组件、store、文案、locale 键、样式、远程浏览器场景和 ARIA 快照均不存在。`OnboardingModal` 继续作为可采取行动的凭据步骤的可见外层。

**历史确认字段仍可被解析，但不再是浏览器能力。** Host 保留 `ui-onboarding.welcomeNoticeVersion` schema，使已有 `settings.yaml` 文档继续有效。API Proxy 不再将该 namespace 加入允许列表，客户端也不读取、写入或订阅它。该字段可以作为无行为的兼容数据留在磁盘上。

本决策部分取代[版本化 GUI 欢迎引导](../feature/2026-07-30-versioned-gui-welcome-onboarding.md)与[共用弹窗产品引导](../feature/2026-08-13-shared-modal-product-onboarding.md)中关于展示与确认的部分；两者关于引导协调器和凭据弹窗的决策仍然有效。另一项[移除首次启动内测声明](2026-08-13-remove-first-run-beta-notice.md)继续负责确保更早的遥测提示与占满视口的展示方式保持缺席。

## 曾考虑的替代方案

**改写或缩短声明。** 不采用：发布阶段背景仍不是首次使用的必需操作；无论文案多短，强制确认都会造成阻碍。

**把声明改成可关闭或只显示一次。** 不采用：两种方案都会为一段可放在文档或发布沟通中的可选文字继续保留状态、远程／回环差异和 UI 机制。

**删除 `ui-onboarding` settings schema 与已存字段。** 不采用：既有设置文档可能含有该字段；保留 schema 可以在不暴露产品行为的前提下维持文档有效性。

**移除全部首次使用引导。** 不采用：DeepSeek 凭据弹窗会指出一个可修复状态，并通过既有 secret 边界写入缺失凭据。

## 后果

页面不会渲染「内测声明」／“Internal Testing Notice”弹窗。没有可用提供方的部署仍可直接显示 DeepSeek API Key 弹窗；已就绪或无法由界面修复的部署不显示任何引导弹窗。已发布的浏览器不再通过 settings 协议发送欢迎确认，而既有确认数据可无害地留在磁盘上。组装后的 Chromium 场景会断言凭据输入前与重载后均无该声明，client 注册测试则固定只有一个引导占位项。
