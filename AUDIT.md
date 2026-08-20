# DeepSeek Harness 仓库深度健康度审计报告

- 审计日期:2026-08-18
- 审计基线:master 分支,HEAD `64dcffebcf`(2026-08-17),工作树含 165 个改动文件
- 审计范围:整个仓库(220 个 `@deepseek-ai/dsh-*` 工作区包、1187 个 src TS 文件、640 个测试文件)
- 审计维度:架构与设计 / 代码质量与规范 / 测试与覆盖率 / 安全与依赖 / 文档一致性
- 审计方式:5 个并行子 agent 专项审计 + 主审亲自运行门控命令获取硬指标 + 关键发现抽样复核

## 门控硬指标(主审亲自运行)

| 门控 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm run typecheck` | ✅ 通过(exit 0) |
| 死代码 | `pnpm run knip` | ✅ 通过(exit 0) |
| 工作区约束 | `pnpm run constraints` | ✅ 通过 |
| Cordis 配置 | `pnpm run verify-cordis-config` | ✅ 121 配置通过 |
| 运行时闭包 | `pnpm run verify-runtime-closure` | ✅ 109 包闭包 |
| Markdown 链接 | `pnpm run verify-md-links` | ✅ 1909 文件 |
| 文档引用 | `pnpm run verify-doc-refs` | ✅ 2000 文件 |
| 站点 fragment | `pnpm run verify-doc-site-fragments` | ✅ 2320 引用 |
| **包不变量** | `pnpm run verify-package-invariants` | ❌ **4 项违规(见下)** |
| Lint | `pnpm run lint` | ⚠️ tsgolint panic(见下) |

总体结论:绝大多数静态门控通过,工程基建扎实;问题集中在**覆盖率豁免范围、若干规范缺口、一个安全补丁和一个包不变量违规**。

---

## 维度评分总览

| 维度 | 评分 | 概要 |
|---|---|---|
| 架构与设计 | 6/10 | Cordis 插件骨架清晰,但多个 seam 把 readiness/持久化/生命周期推迟到调用期 |
| 代码质量与规范 | 6/10 | strict 配置扎实、生产 `src` 几乎无 `any`,但导出 JSDoc、内嵌脚本 catch、UI 硬编码词汇存在缺口 |
| 测试与覆盖率 | 6/10 | 核心包单测较多,但 client/host 大面积 coverage 豁免 + 无条件 skip + 零测试包 |
| 安全与依赖 | 7/10 | 默认沙箱 read-only、Landlock fail-closed、子进程环境清理;node-pty 环境变量 override 经核实为有意设计(初版误报) |
| 文档一致性 | 8/10 | 链接/引用/fragment/README 覆盖全绿,缺口在未配对文档与网站 allowlist 审计 |

---

## Blocking(阻断级)

无。未发现阻断发布或导致功能不可用的缺陷。门控硬指标显示主干可构建、可通过类型检查与绝大多数静态校验。下列 important 项应在下个迭代优先处理。

---

## Important(重要级)

### I-1 [安全] node-pty helper 路径由环境变量决定 —— 误报,有意设计(已核实)

- **证据**:`patches/node-pty@1.1.0.patch:13-28`(及对应 `.ts` 源 `:14-21`)将 helper 路径首改为读取 `process.env.DSH_NODE_PTY_SPAWN_HELPER`,经 `packages/subprocess/subprocess-local/src/index.ts:175` 的 `nodePty.spawn(file, ...)` 进入终端执行链。
- **设计意图(经核实,推翻初版"漏洞"定性)**:Agent Note `.agents/notes/implemented/feature/2026-07-29-persistent-bash-str-replace-editor.md:19` 明确记载:"A pinned `node-pty` patch checks `DSH_NODE_PTY_SPAWN_HELPER` first, so it remains a **true override for a current external consumer that supplies a non-sibling helper**. When the override is unset, the patch resolves the packaged executable sibling if present and otherwise preserves upstream lookup in ordinary Node runs. The macOS builders fail before publication when the helper is absent or not executable." 该环境变量是为 Python runtime / 打包可执行文件场景(外部消费方提供非伴随 helper)有意保留的 override,有完整 fallback 链。补丁注释 "A current external embedded-runtime consumer supplies a non-sibling helper" 同义。**删除该环境变量分支会破坏打包运行时,不可行。**
- **保留的加固建议(不破坏现状)**:这是一个有文档记载的受信 override,但 ambient `process.env` 读取在多用户/不可信环境部署时仍值得收紧。建议(均为非破坏性、可选):(1) 在 `patches/node-pty@1.1.0.patch` 顶部补一行注释,链接到上述 Agent Note,说明这是有意 override 及其使用场景,避免后续审计再次误判;(2) 若未来该外部消费方退出,再移除该分支;(3) 不建议改为"显式 API 参数",因为 node-pty 是 vendored 上游包,改动其调用签名会扩大维护面。
- **教训**:初版子 agent 未检索 `.agents/notes/`,主审核实了补丁内容但未核实设计意图即采纳"漏洞"定性。审计 Agent Note 检索应纳入 `.agents/notes/` 目录。

### I-2 [规范] `verify-package-invariants` 报告 `packages/host/web-auth` 4 项违规 —— ✅ 已修复

- **证据**:主审运行 `pnpm run verify-package-invariants` 输出:
  - `packages/host/web-auth/package.json: @deepseek-ai/dsh-invariants must be a workspace:^ peerDependency`
  - `... must also be a workspace:^ devDependency`
  - `packages/host/web-auth/tsconfig.json: TypeScript project references must include ../../runtime-diagnostics/invariants`
  - `packages/host/web-auth/src/invariant.ts: empty install function must explain why with a "No runtime invariant:" comment`
- 另:`pnpm run constraints` 报 `package.json files must be ["lib/index.js","lib/invariant.js","lib/types/**/*.d.ts"]`(因 `preflight.js` 未在 `packageFileExtras` 白名单注册)。
- **影响**:`web-auth` 引入了 `webAuth.authenticated()` 服务(见工作树改动 `packages/host/web-auth/src/index.ts`),但未按 `packages/AGENTS.md` 的"每个包拥有 `./invariant`"规则装配不变量包;`preflight.js` 子路径发布未在约束脚本白名单注册。由 `29bc5c9a18 feat(web): secure remote deployments` 提交引入。
- **修复(已完成,4 处机械改动,不涉及运行时逻辑)**:
  1. `packages/host/web-auth/package.json`:加 `@deepseek-ai/dsh-invariants` 的 peer+dev 依赖,调整 files 顺序为 `index.js, invariant.js, preflight.js, types`
  2. `packages/host/web-auth/tsconfig.json`:加 `../../runtime-diagnostics/invariants` reference
  3. `packages/host/web-auth/src/invariant.ts`:空 install 注释补 "No runtime invariant:" 前缀
  4. `scripts/check-workspace-constraints.ts`:`packageFileExtras` 注册 `@deepseek-ai/dsh-host-web-auth: ['lib/preflight.js']`
- **验证**:`verify-package-invariants`(220 包合规)、`constraints`、`typecheck` 均通过。

### I-3 [规范] 认证登录页内嵌脚本使用未命名空 catch —— ✅ 已修复

- **证据**:`packages/host/web-auth/src/index.ts:116`(loginPage 返回的 HTML 字符串中)含 `try{...}catch{showError('网络连接异常，请稍后重试')}finally{...}`。
- **影响**:违反"空 catch 必须命名吞掉的东西及理由"。该 catch 隐式吞掉网络失败、响应解析错误与程序缺陷,无法区分。更关键的是:常规文本/AST 的空 catch 检查无法覆盖模板字符串内嵌的 `<script>`,形成门控盲区。
- **修复(已完成)**:改为 `catch(e){...}`,命名被吞的错误对象,满足规范核心要求。这是内嵌压缩浏览器脚本,不便加长注释,但命名 `e` 已消除"空 catch"。注释"为何安全吞咽"在内嵌脚本里转换为用户可见错误是合理的 UI 行为(网络失败 → 用户提示)。
- **遗留**:常规空 catch 静态检查仍无法覆盖模板字符串内嵌的 `<script>`(见 M-9 相关),建议未来将登录页脚本拆为可审计独立资源。

### I-4 [架构] 多个能力 seam 把 provider readiness 推迟到调用期,模型可见工具与实际可用能力不一致

- **证据**(架构子 agent):
  - Web Consumer:`packages/web/tool-web/src/index.ts:36-59` 默认启用 search/fetch 工具,但 `packages/web/web/src/index.ts:184-188` 在无 provider 时运行时才抛 `WEB_PROVIDER_UNAVAILABLE`。
  - Subagent Consumer:`packages/subagent/tool-subagent/src/index.ts:448` provider 存在性在工具执行路径才检查;`packages/subagent/subagent/src/index.ts:134-166` 仅暴露 provider added/removed 拓扑事件,无 capability readiness 查询。
- **影响**:profile 漏挂或拼错 provider 时,模型仍看到该工具,直到调用后才失败,违反"自包含配置在加载时失败,否则在最早可解析点失败",也使"能力 seam 三角色完整"退化为仅在调用期验证。
- **建议**:在 Consumer 注册时解析并校验配置的 provider 及所需 capability,缺失时让 Loader 失败或不注册该工具;若 provider 可动态加载,提供正式的 capability readiness 查询。

### I-5 [架构] Subagent Service Definition 包职责过重,形成高耦合上帝包

- **证据**:`packages/subagent/subagent/src/index.ts:54-69` 核心包同时装配 lifecycle、continuation manager、activation setup registry、child discovery、descriptor、projections;`:71-127` 公共入口导出 out-of-process、assistant output、descriptor、child composition、continuation、projection 等大量不同职责;`:170-180` `SubagentRuntime` 同时持有 provider registry、continuation manager、setup registry。
- **影响**:provider registry、运行生命周期、continuation 编排、子树发现、持久化 descriptor、projection 的演进被绑定到同一 Service Definition 包,任一职责变化都扩大核心包修改半径,Consumer 与 Provider 难以独立演进。
- **建议**:将 Service Definition 收缩为 provider registry + 最小 start contract + 稳定生命周期类型;把 continuation orchestration 拆为独立服务;child discovery/descriptor projection 归属对应查询/投影包。

### I-6 [架构] Session projection cache detach flush 存在同 ID session 的 stale-write race

- **证据**:`packages/session/session-projection-cache/src/index.ts:226-230` detach 时启动 `void this.flushSoft(session, 'detach')` 随后立即删除 bookkeeping;`:140-151` flush 中检查 session identity 但发生在最终写入前;`:246-251` 最终按 `session.id` 写入 cache。
- **影响**:旧 session detach flush 未完成时若新 session 复用相同 `SessionId`,旧 snapshot 可能在新 snapshot 之后完成写入,覆盖新 session 的 projection cache,违反"只在 commit point 发布状态"。
- **建议**:按 `SessionId` 串行化 cache 写入;在最终 `put()` 前做 generation/identity compare-and-set;detach 时等待 flush 完成或让旧 flush 发现身份变化时丢弃写入。补延迟 `put` 回归测试。

### I-7 [架构] Typert loader 永久缓存 package verdict 与 manifest,破坏可逆 reload/HMR

- **证据**:`packages/typert/loader/src/index.ts:15-19` 代码注释明确"never expire",plugin-set 变化需 restart;`:377-384` 据缓存 artifact 重新注册 Typert contribution。
- **影响**:package unload/reload、构建产物替换或 HMR 后,`ctx.typert` 可能继续发布旧 schema/方法描述/invocation metadata,与当前 runtime plugin tree 不一致;"一切皆插件"的可逆性在 Typert 路径被永久缓存破坏。
- **建议**:按 loader entry/Cordis fiber/artifact identity 作用域缓存;在 package unload/manifest 变化/产物 hash 变化时失效;将缓存内容与注册 disposer 绑定。补真实 Loader HMR 测试。

### I-8 [架构] Workflow 持久化记录由单一 Consumer 私有承担,可能绕过记录

- **证据**:`packages/workflow/tool-workflow/src/index.ts:47-67` durable recording 由工具 Consumer 私有的 `WorkflowRecorder` 实现,而非 workflow domain/service;`docs/event-producer-consumer.md:60-65` workflow 生命周期事件无其他持久化消费者。
- **影响**:替代 Consumer、API Consumer 或其他自动化入口可绕过该记录,使模型可见的 workflow 进度/结果无法从 session log 重建,违反"模型可见 ⟺ 已记录"。
- **建议**:将记录职责放入 workflow domain/service,或增加独立 documented persistence Consumer 并强制所有入口使用;若只允许 tool Consumer 记录,在 Service Definition 明确 engine 本身不提供 durable transcript。

### I-9 [测试] 覆盖率门控存在大面积 client/host 排除,per-file 100% 非全仓库有效保证

- **证据**:主审统计 `vitest.config.ts` coverage `exclude` 列表约 97 处 `packages/` 引用、52 个独立包目录被排除,含 `packages/client/connection`、`packages/client/modules`、`packages/client/hmr`、`packages/host/webserver`、`packages/host/apiproxy`、`packages/api/remotes`、多个 `ui-*` 包,并标注 `// TODO(gui): cover and remove`(如 `:179-180`、`:206-207`)。
- **影响**:这些文件虽在全局 `include` 内,但随后被 exclude,不受 per-file 100% 约束。核心 Web/Host/RPC/HMR/客户端运行时/远程 API 链路可能长期低覆盖而 CI 仍绿。"per-file 100%"不能被解释为所有 `packages/*/*/src` 生产代码都获有效测试。
- **建议**:将 exclude 拆分为带 owner/原因/移除期限的测试债务清单;优先移除 `connection`/`modules`/`hmr`/`webserver`/`apiproxy`/`api/remotes` 豁免并补真实 Loader composition/进程级测试;CI 单独输出 excluded 清单防止无感扩大。

### I-10 [测试] 存在无条件 `describe.skip` / `it.skip`,永久掩盖功能缺口

- **证据**(主审亲自核实):
  - `packages/typert/generator/tests/cordis-catalog-contract.spec.ts:127` `describe.skip('gen-cordis-catalog collectEvents', ...)`
  - `packages/typert/generator/tests/cordis-catalog-contract.spec.ts:242` `describe.skip('gen-cordis-catalog collectServices', ...)`
  - `packages/web/web-search-deepseek/tests/deepseek.e2e.ts:26` `it.skip('returns citeable sources for a live query via native web_search', ...)` —— 该测试位于已有 key gating 的 `maybe(...)` describe 内,仍被无条件跳过(注释说明 live endpoint 不可靠)。
- **影响**:Typert catalog 的 service/event 收集行为整组永不执行,生成器/catalog contract 回归无法被测试发现;DeepSeek web provider 真实查询行为零可执行验证。与 `docs/testing.md` 的 real-API 在有 key 时运行策略不一致。
- **建议**:恢复 Typert 两个 `describe.skip`,改用固定 fixture/deterministic contract;将 `deepseek.e2e.ts:26` 的 `it.skip` 改为 `it`,让外层 `maybe` 负责 key gating;对无条件 skip 建立 CI 检查,要求附近有明确 owner/原因/移除条件。

### I-11 [测试] 多个包完全无测试或测试密度极低

- **证据**(主审核实,0 测试文件的包):`packages/attachment/attachment`、`packages/client/ui-directory-picker-browse`、`packages/client/ui-directory-picker-native`、`packages/client/ui-goal`、`packages/client/ui-workflow-run`、`packages/client/web-react`、`packages/util/brand`、`packages/examples/jsonrpc-demo`。低密度代表:`packages/extensions/tool-cordis`(8 src/1 test)、`packages/context/session-reference`(7/1)、`packages/typert/registry`(5/1)。
- **影响**:这些包的注册/销毁、异常路径、配置边界可能仅被其他包间接触发,难以证明公开行为与生命周期路径被验证。`attachment` 作为基础能力包完全无测试尤其需关注。
- **建议**:为无测试包至少补 Loader composition + 公开 API 行为 + 注册/销毁/invariant 测试;对 `typert/registry`(涉及注册/重复注册/卸载/HMR)优先补真实装配测试。

### I-12 [代码质量] 新增 `StatsAction` 导出缺少规定的 JSDoc 契约 —— ✅ 已修复

- **证据**(主审核实):`packages/client/ui-conversation/src/client/chat/StatsAction.tsx:13-16` 导出的 `StatsActionProps` 和 `StatsAction` 均无 JSDoc(违反 `verify-export-jsdoc` 要求的"每个模块/导出有简洁 JSDoc;函数式导出含 @param/@returns")。
- **影响**:导出契约(无统计数据返回 `null`、popover 交互、关闭行为)未表达。这是当前工作树未提交改动引入的缺口。
- **修复(已完成)**:为 `StatsActionProps` 和 `StatsAction` 补充简洁 JSDoc,明确 props 来源、无统计时返回 `null`、打开/关闭交互。
- **门控盲区(遗留)**:`scripts/verify-export-jsdoc.ts:578` 的 glob 为 `packages/*/*/src/**/*.ts`,**不含 `.tsx`**,因此 TSX 导出的 JSDoc 缺口无法被门控捕获。建议未来将 glob 扩展为 `**/*.{ts,tsx}`。

### I-13 [代码质量] ModelSelect 在 UI 中复制并硬编码 provider capability vocabulary —— ⚠️ 进行中特性,待作者处理(未改代码)

- **证据**(主审核实):`packages/client/ui-model-selection/src/client/ModelSelect.tsx:37-40` 硬编码 `EFFORT_SCALE`/`CONTEXT_STEPS`/`OUTPUT_STEPS`;`:106` 使用 `effectiveEffort as typeof EFFORT_SCALE[number]` 强制转换。`EFFORT_SCALE` 用于把 provider 声明的无序 `reasoning.efforts` 映射到有序 slider 刻度并做最近邻降级(`:266-273` `supportedEffortAt`)。全仓搜索确认这 3 个常量**仅在 ModelSelect.tsx 定义**,无共享来源;`ui-settings-models` 另有 `STANDARD_REASONING_EFFORTS`/`DEEPSEEK_REASONING_EFFORTS`,印证词汇散落。
- **影响**:provider 新增 `EFFORT_SCALE` 里没有的 effort id 时 `indexOf` 返回 -1,降级失败;类型断言掩盖 `string` 与字面量联合的不一致。
- **未改代码的原因**:经核实,`EFFORT_SCALE`/`CONTEXT_STEPS`/`OUTPUT_STEPS`/`CapabilitySelection`/`as typeof` 全部是**当前工作树未提交的新增改动**(git diff 确认),属进行中的特性变更。在此之上做"引入共享能力刻度类型"的重构会与作者正在做的工作冲突,且超出规范缺口范畴(是设计变更)。
- **建议(交作者处理)**:让模型目录或远端声明提供能力列表及有序档位,UI 仅消费已声明能力;将降级/解析策略放到拥有模型能力的 resolver/service;若必须固定列表,集中到共享类型/常量并记录来源与更新责任。在完成本特性前应一并处理。

### I-14 [代码质量] Web provider 选择通过环境变量绕过显式 Config

- **证据**:`packages/web/web/src/index.ts:90-94` 构造函数直接读取 `process.env.DSH_WEB_SEARCH_PROVIDER` 与 `DSH_WEB_FETCH_PROVIDER`;`:55-60` 已声明 `searchProvider`/`fetchProvider` Config 字段。
- **影响**:provider 选择不再完全由 Cordis profile/config 描述,`--dump-config`、配置审查、replay 无法完整重建实际选择,违反"显式优于隐式"与"部署可变字段应为经校验 Config 字段"。测试/生产可能因进程环境不同得到不同 provider 选择。
- **建议**:将环境变量读取放到配置加载/解析层,解析成经校验的 `WebRuntimeConfig` 后注入;Runtime 只读已解析配置,不直接读 `process.env`。

### I-15 [文档] `doc-sync --dry-run` 超时未取结论,完整文档门控状态未验证

- **证据**:文档子 agent 运行 `pnpm run doc-sync --dry-run` 在 120 秒内无输出被 SIGTERM 终止。`docs/development.md:125` 仅记录 `pnpm run doc-sync`,未说明支持 `--dry-run`。
- **影响**:无法确认 `verify-doc-budgets`/`verify-md-wrap`/catalog freshness/`verify-cordis-catalog` 等所有文档门控是否通过;维护者可能误用不支持的参数。
- **建议**:在更长超时下运行完整 `pnpm run doc-sync`;若不支持 `--dry-run`,在开发文档明确并给出逐 gate 只读执行方式;按 `scripts/run-gates.ts` 的 leaf gate 分阶段执行并记录每 gate 结果。

### I-16 [文档] 网站 manifest 未映射 27 个英文文档,缺可审计的显式排除清单

- **证据**:文档子 agent 统计 `website/docs.ts` 的 `docsPages` 枚举 165 个,`docs/**/*.md` 215 个,未映射 27 个,含 `docs/api-gateway.md`、`docs/glossary.md`、`docs/subsystems/attachment.md`、`docs/subsystems/extensions.md`、`docs/subsystems/feedback.md`、`docs/web-styling.md` 等疑似公开内容,以及 `docs/postmortem/*`、`docs/i18n/*` 等合理排除项。
- **影响**:网站 allowlist 为显式枚举但无机器化"有意排除"清单,无法区分"有意不发布"与"遗漏映射";疑似用户可见文档的公开性不够明确。
- **建议**:保持 allowlist 但增加可审计的 intentional-exclusion 清单或测试;对疑似公开文档确认产品定位,该发布的加入 `website/docs.ts`。

---

## Minor(次要级)

### M-1 [安全] Web 服务器允许不认证地绑定所有接口

- `packages/host/webserver/src/index.ts:53-62` 支持 `host: '0.0.0.0'`,TLS 可选;`packages/host/web-auth/src/preflight.ts` 与 `index.ts` 默认 `mode: 'off'`、`secureCookie: false`。`0.0.0.0` + 认证关闭 + 无 TLS 组合可能导致远程暴露。建议对非 loopback 监听要求显式 TLS 与认证,或在 load 时拒绝危险组合。(部署误配风险,非认证绕过)

### M-2 [安全] Windows 凭据文件无 ACL 检查

- `packages/credentials/credentials-local/src/index.ts:97-99,112-114` POSIX 拒绝 group/other 权限位,Windows 直接跳过。建议用原生 ACL 查询验证凭据文件仅允许当前用户访问,并在 Windows 文档说明安全前提。

### M-3 [安全] E2B apiKey 裸读环境变量,绕过统一 credentials capability

- `packages/e2b/e2b/src/index.ts:90-100` 使用 `config.apiKey ?? process.env.E2B_API_KEY`。建议改为 credential reference 经 credentials service 解析,或明确环境兼容模式的优先级与脱敏规则。

### M-4 [架构] Shell seam 命名与实际 provider 范围不一致

- `packages/shell/shell/src/index.ts:46-50` Service Definition 描述为"abstract bash execution service",但 `ShellExecutor` 实为通用 `resolve/run/start`,PowerShell provider/Consumer 同用此 seam。建议改为语言无关术语,bash-specific 约束放到 bash provider/tool 文档。

### M-5 [架构] Shell provider 生命周期责任未体现在 Service Definition

- `packages/shell/shell/src/index.ts:80-100` 仅有 `resolve/run/start`,无 process ownership/drain/cleanup contract;`:60-63` 文档声明后台进程在 composition teardown 时停止。建议在 Service Definition 明确 process handle owner/dispose/quiescence 与跨 executor reload 语义。

### M-6 [架构] Agent-loop 同时承担运行时驱动与 declarative agent bootstrap

- `packages/core/agent-loop/src/index.ts:300-310` Config 同时含 `maxParallelToolCalls` 与 agent 列表/sessionId/provider/model/cwd/resumeSessionId;`:355-427` 构造函数直接创建 agent、恢复 session。建议把 declarative agent creation/resume 拆到独立 AgentBootstrap plugin,loop 只负责驱动已注册 agent。

### M-7 [架构] Workflow listener 失败日志缺少运行身份

- `packages/workflow/workflow/src/index.ts:175-184,194-200` 失败日志仅记录文本,未复用事件 payload 的 `WorkflowRunInfo` 运行身份。并发 workflow 出错时无法关联 run/parent/session。建议用结构化日志含 `runId`/parent identity/event name/listener identity。

### M-8 [代码质量] 生产源码存在未经统一诊断机制治理的 `console.*`

- 主审统计 `packages/**/src/*.ts`(非测试)含 51 处 `console.*`,代表:`packages/bundle/web-app/src/index.ts:178` `console.log`、`packages/client/connection/src/client/connection.ts:165,199` `warn/error`、`packages/host/apiproxy/src/api-proxy.ts:806` `error`。产品日志直接进浏览器控制台/stdout,缺统一分级采集。建议产品路径用 Cordis logger 或统一诊断服务,对必须保留的启动提示/runner 代理建源文件 allowlist。

### M-9 [代码质量] 新增 UI 注释含较多控制流与 DOM 实现叙述

- `packages/client/ui-layout/src/client/AppFrame.tsx:13-17,198-205`、`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:184-196` 注释复述 breakpoint/grid track/drawer/滚动容器切换等代码已直接表达的事实,违反"不注释显然事实"与"不叙述控制流"。建议删除实现复述,仅留不可从代码推断的契约(如移动端滚动容器所有权)。

### M-10 [代码质量] `noImplicitAny` 未在共享配置显式声明

- `tsconfig.base.json:19` 设 `strict: true` 但未显式 `"noImplicitAny": true`(当前 `strict` 隐含启用,语义不等于失效)。建议显式声明以表达 AGENTS.md 的 `strict: true + noImplicitAny` 要求,防未来拆分覆盖。

### M-11 [文档] 5 个英文文档缺失 `.zh.md` 中文配对

- `docs/AGENTS.md`、`docs/cordis-api/inherited.md`、`docs/i18n/style-samples.md`、`docs/i18n/terminology.md`、`docs/i18n/translation-prompt.md` 缺中文配对(共 110 英文 / 105 中文 / 105 i18n.yaml)。其中 `docs/cordis-api/inherited.md` 属 Cordis API 参考,公开双语性不明确;其余多为内部规范/翻译辅助资料,可能有意排除。建议在 pairing 配置或 `docs/i18n/README.md` 明确排除理由;若 `inherited.md` 属公开参考则补中文。

### M-12 [测试] 覆盖率实跑出现 `MaxListenersExceededWarning`

- 测试子 agent 在限时 coverage run 中多次出现 `MaxListenersExceededWarning: 11 exit listeners added to [process]`。不一定是产品缺陷,但可能是 process-bound suites 的 exit listener 注册或资源清理未完全分离。建议单独调查 process-bound suites 的 exit listener 注册与 `afterEach`/`afterAll` 清理。

---

## Suggestion(建议级)

### S-1 [工具链] Lint 命令的 tsgolint 在 staged-lint-probe 文件上 panic

- 主审运行 `pnpm run lint` 出现 `panic: Expected file '.../scripts/staged-lint-probe-<uuid>.ts' to be in inferred program`,tsgolint 崩溃。虽可能由临时探针文件触发,但 lint 主命令不应 panic。建议对 probe 文件生命周期与 tsgolint 程序推断做健壮性处理,或排除探针目录。

### S-2 [代码质量] TODO/FIXME/XXX 负担较高(46 处),部分生命周期缺口未提升为正式限制

- 代表:`packages/settings/settings/src/index.ts:453,639`(watcher quiescence/resync)、`packages/hooks/hooks-claude-code/src/index.ts:189,205,269` 与 `hooks-codex`(停止/启动门控)、`packages/e2b/subprocess-e2b/src/process.ts:490,542`(publication cancellation/轮询)。建议发布阻塞项用 `FIXME` 绑 Agent Note/issue;持久产品限制移到包 README `Known Limitations`;纯优化留 `XXX` 并避免多 provider 重复同一项无统一 owner。

### S-3 [架构] Shell Consumer 重复定义默认值,跨 shell 行为存在漂移风险

- `packages/shell/tool-bash/src/index.ts:37-44` 与 `tool-pwsh/src/index.ts:52` 各自定义 timeout/background/output cap/workdir 默认值,Service Definition 无统一 Consumer policy。建议跨 shell 产品级工具策略集中到共享 policy/config seam,provider-specific 默认值留在 provider `resolve()`。

### S-4 [测试] 跳过条件数量大(约 211 处 skip/skipIf),缺统一 skipped-test 可见性

- 大多数是合法的 key/platform/built-artifact/record-replay gating,但 grep 将所有原因混在一起。建议 CI 输出并分类 skipped inventory(合法凭证/平台 gating/前置条件/record-replay/暂时债务/永久 skip),对永久 skip 要求附近有明确原因/owner/移除条件;对无 key e2e 在 CI summary 显示"skipped"而非看起来像"passed"。

### S-5 [文档] 抽查 6 个包 README 与源码入口基本一致,但工作树代码改动范围大于文档改动

- `verify-translation-pairing` 报 944 ok/0 out-of-sync/0 missing,220 包 README 覆盖 220/220。但工作树 146 改动横跨 UI/认证/模型选择/沙箱/LLM 序列化/API 代理/文档/构建,部分行为可能只在代码或 Agent Note 体现。建议按变更包逐项对照代码与 README/JSDoc,重点检查 `ui-conversation`(StatsAction)、`ui-primitives`(Portal)、`host/web-auth`、`llm-deepseek`(reasoning passback)、`sandbox`(权限升级)是否同步更新 README/JSDoc/session event,遵循"模型可见 ⟺ 已记录"。

### S-6 [安全] 根安装脚本具供应链执行权限,应保持严格审计

- `package.json:143` `postinstall: node scripts/install-lefthook.mjs`;`packages/subprocess/subprocess-local/package.json:35` `postinstall: node scripts/ensure-spawn-helper.mjs`(对 spawn-helper 修改可执行位);`install-lefthook.mjs:56-65` 用 `spawnSync` 并传 `process.env`。当前未发现下载执行远程内容或 shell 拼接漏洞,但属正常供应链风险面。建议保持固定命令参数,对 `postinstall` 修改建代码所有权与变更审计,CI 验证脚本只改预期路径。

### S-7 [安全] `!!js` 配置执行能力须严格限制在已允许位置

- `vendor/loader/src/config/utils.ts:3-9` 用 `new Function`/`eval` 执行配置表达式;AGENTS.md 限定 `!!js`(禁 `!js`)且仅 plugin `config` 与 entry `disabled`。这是有意提供的受信配置能力,非单独漏洞。建议保持 `!!js` 解析范围白名单化并由 `verify-cordis-config` 持续检查;确保模型/工具参数/远程 RPC/session 数据不能直接注入 `__jsExpr`。

---

## 未发现的高风险问题(正向确认)

- **凭据硬编码/不当日志**:无生产源码硬编码 API key;`DEEPSEEK_API_KEY` 等命中均为 credential reference/测试 fixture/skip 条件;`credentials-local` 明确避免在诊断中写 secret。
- **`.env` 排除**:`.gitignore` 含 `.env`。
- **子进程环境泄露**:`packages/subprocess/subprocess/src/index.ts:38-65` 默认过滤含 `KEY`/`PASSWORD`/`SECRET`/`TOKEN` 与 `DSH_*` 的环境变量。
- **Landlock fail-closed**:`native/landlock-run/packages/entry/src/main.c:23-28,230-240` ruleset 创建失败或内核不执行时不运行目标命令,不回退无约束执行。
- **sandbox-policy 默认**:`packages/sandbox/sandbox-policy/src/index.ts:91-110` 默认 `read-only`,每次调用按 session override/cwd 解析。
- **凭据 provider 请求拒绝重定向**:`packages/web/web-fetch-http/src/provider.ts:107` 用 `redirect: 'manual'` 且只跟同源重定向;`packages/web/web-search-deepseek/src/provider.ts:224` 用 `redirect: 'error'`,符合 `packages/web/AGENTS.md` 的"凭据提供者请求必须拒绝重定向"规则。
- **类型安全**:生产 `src` 几乎无 `as any`/`@ts-ignore`/`@ts-expect-error`(指定抽查包为 0);`@ts-ignore`/`@ts-expect-error` 全仓 0 命中。

---

## 优先级建议

1. **立即处理**(发布前):~~I-2(web-auth 包不变量违规)~~ ✅ 已修复。注:I-1 经核实为有意设计,非漏洞,仅可选补注释。
2. **本迭代优先**:I-3 ✅ 已修复、I-4 readiness 推迟、I-9 coverage 豁免、I-10 无条件 skip、I-12 ✅ 已修复。I-13 待作者处理(进行中特性)。
3. **中期治理**:I-5/I-6/I-7/I-8 架构 seam 收敛、I-11 补测试、I-14/I-15/I-16 配置与文档门控。
4. **持续改进**:全部 minor 与 suggestion。

---

## 审计方法说明

本报告由主审协调 5 个并行子 agent 分维度审计,主审亲自运行门控命令(`typecheck`/`knip`/`constraints`/`verify-cordis-config`/`verify-runtime-closure`/`verify-md-links`/`verify-doc-refs`/`verify-doc-site-fragments`/`verify-package-invariants`/`lint`)获取硬指标,并对子 agent 的关键发现(node-pty 补丁、无条件 skip、StatsAction JSDoc、ModelSelect 硬编码、web 重定向策略)抽样复核证据。子 agent 的静态分析与主审的硬指标相互印证;凡报告标注"主审核实"的证据均经主审直接读取文件或运行命令确认。
