# Agent Note: Web 认证的滑动会话过期

Status: implemented

[English](2026-08-20-web-auth-sliding-session-expiration.md) | 中文

## Problem

[经过认证的远程 Web 部署](2026-08-16-web-remote-deployment-authentication.md)引入的 Web 认证会话不携带 Cookie `Max-Age`，也没有过期逻辑。浏览器关闭——或浏览器回收标签页——就会丢失 Cookie，因为没有 `Max-Age`/`Expires` 使其成为会话级 Cookie。用户无法在浏览器重启后保持登录，也无法限制泄露 Cookie 的有效寿命：会话存在于一个永不过期、永不刷新的 `Set<string>` 中。

## Decision

`dsh-host-web-auth` 将会话 `Set` 替换为携带 `createdAt` 和 `lastSeen`（毫秒时间戳）的 `Map<string, SessionRecord>`。两个经过校验的 `Config` 字段约束每个会话：

- `idleTimeoutMs`（默认 7 天）：超过此时长无活动的会话过期。
- `absoluteTimeoutMs`（默认 30 天）：即使持续使用，到达此时长也必须重新认证。

`absoluteTimeoutMs < idleTimeoutMs` 是加载期错误配置并会抛出异常。Cookie 获得 `Max-Age`，等于活动窗口：登录时为 `min(idle, absolute)`；续期时向绝对截止时间收缩。`WebAuth` 新增 `renew(cookie, res)`，在响应上刷新 `lastSeen` 并重写 Cookie `Max-Age`。HTTP 请求 guard 和 `/auth/session` 路由在每个已认证请求上调用 `renew`，因此持续活动会延长空闲窗口而无需重新认证。upgrade guard 不续期（WebSocket 没有可设置 Cookie 的响应）。过期会话在下一次 `authenticated` 或 `renew` 调用时被惰性清除。

## 续期时的 Cookie Max-Age

续期将 `min(idleTimeoutMs, remainingAbsolute)` 写为 Cookie `Max-Age`，其中 `remainingAbsolute = absoluteTimeoutMs - (now - createdAt)`。接近绝对上限时，Cookie 会缩短到空闲窗口以下，因此在上限前刚好空闲满整个空闲窗口的浏览器仍会在正确时间重新认证。续期后的 Cookie 永远不会声称服务器不会兑现的寿命。

## Alternatives considered

**单独的 `/auth/refresh` 端点交换刷新令牌。** 未采用，因为最小登录页不附带 JavaScript，且当前组合没有会调用它的客户端定时器。guard 中的滑动续期无需前端改动：浏览器已发出的每个已认证请求都会延长会话。

**持久化会话以在进程重启后存活。** 未采用，原因与原记录相同：部署需求是传输机密性，持久化会增加此包不拥有的静态状态。滑动过期为内存态、按进程隔离；重启仍会清除所有会话。README 的已知限制明确记录了这一点。

**不设绝对上限，只有空闲超时。** 未采用，因为持续使用的泄露 Cookie 将永不过期。绝对上限限制了无论活动如何的最坏情况，这正是全接口部署所需的安全属性。

## Consequences

持续活动的用户在最长 30 天内不会被强制重新认证，空闲 7 天的 Cookie 会自动过期。代价是泄露 Cookie 在攻击者持续使用期间一直有效，仅受绝对上限约束——这是任何滑动会话设计的相同权衡。进程重启仍会清除所有会话（记录为已知限制）；空闲和绝对期限为内存态、按进程隔离。

## Verification

`packages/host/web-auth/tests/web-auth.spec.ts` 覆盖 guard 路径和 `/auth/session` 路由上的滑动 Cookie `Max-Age` 刷新、窗口到期后的空闲超时过期、持续续期下强制执行的绝对上限（续期循环保持空闲存活；只有上限结束会话），以及 `absoluteTimeoutMs < idleTimeoutMs` 的错误配置拒绝。现有的登录、登出和 guard 测试在行为上不变。
