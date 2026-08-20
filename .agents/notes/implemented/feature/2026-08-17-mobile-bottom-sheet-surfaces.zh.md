# Agent Note: 移动端设置与选择器的底部抽屉表面

Status: implemented

[English](2026-08-17-mobile-bottom-sheet-surfaces.md) | 中文

## 问题

Web 客户端的桌面弹层在手机宽度视口下仍保留桌面几何。设置面板把固定侧边导航栏和狭窄内容列并排放置，导致中文文案逐字换行。输入区的模型、权限、命令、上下文和工作区选择仍是锚定弹出菜单，触控时空间拥挤或被裁剪，也没有适合手机操作的抽屉尺寸。

## 决策

**手机宽度下的设置和选择流程使用可选的底部抽屉表面，短小的桌面操作菜单仍保留弹出菜单。** 在 `max-width: 600px` 下，共享 Modal 贴合底部并使用安全区感知的视口尺寸；SettingsRoot 把导航置于内容上方，导航项改为可横向滚动的 44px 行；选项区域仍是唯一的纵向滚动容器。SettingsRoot 的全视口层通过 `document.body` portal 挂载，因此不会被带 transform 的手机侧栏限制宽度。共享 Modal 根层使用 `1050`，位于 `1000` 的 SettingsRoot 层之上；portaled 菜单使用 `1100`，因此从设置抽屉打开的模型发现和确认弹窗仍可见并可命中，而不会压过菜单。ModelSelect、PermissionSelect、PopupSelectView 和 ContextMeter 使用带可关闭遮罩的固定抽屉，行和控件至少提供 48px 触控目标。共享 Menu 原语增加 `mobileSheet` 选择项，WorkspacePicker 等锚定消费者可由此得到覆盖完整视口的固定抽屉和遮罩，而默认弹出行为不变。

每个抽屉保留所属组件原有的交互语义：Escape 和外部关闭仍调用所属组件的关闭路径，选择回调不变，列表在内部滚动而不是推动页面滚动。安全区 inset 同时用于抽屉边缘和底部内边距；支持时优先使用 `100dvh`。桌面布局和未选择该选项的 Menu 消费者保持不变。

这项决策扩展了现有的输入区共享宽度与控制行规则（[共享宽度轴](2026-08-04-web-composer-shared-width-axis.md)），并让上下文计量器与工作区选择器继续由所属包维护（[上下文计量器](2026-08-05-composer-context-meter-breakdown.md)、[工作区选择器](2026-08-07-workspace-picker-composer-entry.md)）。RiskConfirmation 继续使用共享 Modal，而不是引入第二套确认表面（[Full access 确认](2026-07-31-gui-full-access-confirmation.md)）。

## 考虑过的替代方案

**在手机上继续使用桌面双列设置面板。** 否决：固定的 188px 导航栏会把活动内容列压缩到无法阅读本地化文案，用户必须横向恢复才能使用。

**在手机上把所有 Menu 都改成底部抽屉。** 否决：短小的上下文操作需要贴近触发器，全部菜单模态化会让行操作变得过重。只有选择流程通过 `mobileSheet` 明确选择抽屉。

**用 JavaScript 视口监听决定表现形式。** 否决：视觉断点属于 CSS，媒体查询不需要监听器生命周期，并让服务端、测试和浏览器使用相同的 DOM。

## 后果

手机设置导航从永久侧栏变成横向滚动行，因此较长的分区名称仍可读，内容获得完整抽屉宽度。设置层和 portaled Menu 遮罩挂载到 `document.body`，避免侧栏和页面 stacking context 把其他表面压到活动选择之上。选择流程获得遮罩、安全区间距和更大触控目标，但选择进行时会覆盖对话内容。共享 Menu API 增加一个可选的表现形式标志；现有消费者只有明确选择抽屉时才改变桌面和手机表现。焦点与键盘行为仍由各组件负责，没有替换成通用手势控制器。

变更组件与 body portal 回归的 focused coverage 已通过；完整 Web replay 仍取决于仓库组合浏览器 fixture 与宿主环境。
