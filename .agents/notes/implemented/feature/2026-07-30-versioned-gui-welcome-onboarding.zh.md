# Agent Note: 版本化 GUI 欢迎引导

Status: implemented

[English](2026-07-30-versioned-gui-welcome-onboarding.md) | 中文

## 问题

设置外壳需要为功能插件提供的首次使用步骤建立确定的所有权，使独立弹窗不能堆叠。此前的产品欢迎步骤还引入了持久化确认字段。该弹窗已不在当前产品中，但协调器与既有设置文档仍然存在，因此当前设计必须区分活跃引导行为与兼容数据。

## 决策

**设置外壳协调有序步骤。** `settings.onboarding` 仍是根作用域 list，`ui-settings` 会把其中各条目的 id 和顺序投影到一个协调器，并且只挂载第一个未完成的步骤。当前注册方会收到 `complete()` 和 `openSection(id)`；所有权转移前，不会挂载后续步骤。`ui-settings-models` 当前只以顺序 `0` 注册条件式 DeepSeek 凭据步骤。

**欢迎步骤决策已被取代。** [移除内测声明弹窗](../simplification/2026-08-17-remove-internal-testing-dialog.md)删除了 `welcome-notice` 注册项、组件、文案、确认 store 与浏览器行为。本地或远程浏览器都不会显示或确认产品阶段说明。

**持久化的 `ui-onboarding` 分节只用于兼容。** Host 在当前 `$DSH_HOME/settings.yaml` 下注册 `welcomeNoticeVersion`，使此前步骤写出的文档保持有效。API Proxy 不暴露该 namespace，浏览器插件也不读取、写入或订阅它。

**可见引导自行持有弹窗约定。** 当前 DeepSeek 凭据步骤通过 body portal 的 `OnboardingModal` 渲染，且只在弹窗可见期间把下层应用根节点设为 inert。步骤加载私有事实时，外壳不渲染任何包装。明确操作会移交协调器所有权；Escape 和点击遮罩不会完成该步骤。

## 曾考虑的替代方案

**随欢迎弹窗一起移除协调器。** 不采用：条件式凭据表单仍是功能所有的首次使用引导，外壳仍需为当前与未来步骤提供一套通用排序与完成机制。

**删除历史设置分节。** 不采用：既有 Harness 家目录可能含有 `ui-onboarding.welcomeNoticeVersion`；保留其 schema 可以在不暴露浏览器能力的前提下使这些文档保持有效。

**用浏览器本地存储保留欢迎弹窗。** 不采用：产品阶段说明不值得维护任何完成状态，且浏览器 profile 持久化会偏离 Harness profile 的所有权。

**让各功能分别挂载独立弹窗。** 不采用：多个条件同时成立时，独立弹窗可能堆叠，并争夺焦点与应用根节点 inert 所有权。

## 后果

全新 profile 不显示欢迎声明。没有可用提供方且 DeepSeek 官方凭据可写时，凭据弹窗是第一个也是唯一的已发布引导步骤；已就绪或无法由界面修复的部署不显示任何引导框架。既有欢迎确认数据仍可解析，但不产生行为。定向注册测试与 React 测试固定协调器顺序、条件式移交、仅可见时挂载的弹窗行为与 HMR 清理；真实 Chromium 场景则断言声明不存在，并确认凭据写入继续保持 secret 安全。
