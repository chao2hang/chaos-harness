# Agent Note: Non-widening sandbox_permissions is ignored

Status: implemented

[English](2026-08-17-ignore-non-widening-sandbox-permissions.md) | 中文

## Problem

约束组合会在每个变更工具上公布 `sandbox_permissions`，因为 schema 是注册表全局的。会话即使已处于 `workspace-write` 或 `danger-full-access`，仍会看到这些字段。模型会把 `sandbox_permissions=workspace-write` 套到普通写入和 bash 调用上。先前的执行规则会以 `sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode` 失败该请求，且不运行操作。在 `approval/policy: never` 下，真正的拓宽请求也会被自动拒绝，因此唯一能成功的路径是省略该字段的调用。持续附带该字段的目标工作轮次因此无法编辑或执行命令，即使常驻策略已经允许这些操作。

## Decision

未严格宽于调用常驻模式的 `sandbox_permissions` 是冗余的。`validateEscalationArgs` 跳过该请求的配对校验，`approveEscalation` 返回 `undefined` 且不发起提示，bash、pwsh 与文件系统变更按常驻 `ctx.sandboxPolicy` 模式执行。只有严格更宽的请求才需要 justification。缺少 `sandbox_permissions` 的孤立 `justification` 仍会失败。严格更宽的请求仍须在执行前经过 `ctx.approval`。

schema 枚举仍是封闭的目标集合。若按组合默认值裁剪枚举，会让被切换到更窄模式的会话失去升权杠杆。

这细化了[沙箱升权规则](../feature/2026-07-06-sandbox.md)：无法获批的真正拓宽仍失败关闭；该规则不再作用于未拓宽字段。

## Alternatives considered

**继续让未拓宽请求失败。** 这能保留“字段未被使用”的明确信号，但模型会把该错误当成再次带同一字段重试的理由。常驻策略已经授予该字段所点名的访问，或更宽的访问。

**在常驻策略已是 `danger-full-access` 时隐藏 `sandbox_permissions`。** 工具 schema 是注册表全局的，不按会话变化。会话也可能在加载后被切到更窄模式，那时仍需要这些字段。

**把更窄请求当成单次降权。** 用户已经设定了常驻模式。静默按比会话选择更紧的围栏运行会隐藏该授权，并重新引入用户已关闭的拒绝。

## Consequences

- 模型附带未拓宽的 `sandbox_permissions` 时，普通 write、edit、bash 和 pwsh 调用仍会成功，包括在 `danger-full-access` 下请求 `workspace-write`。
- 真正的拓宽请求仍会提示（或在 `never` 下失败关闭），并仍要求非空 justification。
- 单元覆盖固定 `isStrictlyWider`、配对跳过、`approveEscalation` 返回 `undefined`，以及 bash、pwsh 与文件系统在不发起审批的情况下盖上常驻模式。
