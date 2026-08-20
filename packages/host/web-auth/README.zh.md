# `@deepseek-ai/dsh-host-web-auth`

[English](README.md) | 中文

WebServer 传输层的令牌认证。`required` 会在激活前解析配置的凭据，向未认证浏览器 GET 请求提供最小登录页，并通过 HttpOnly、SameSite Cookie 维护随机内存会话。守卫覆盖静态资源、`/plugins`、`/api` 与 WebSocket 升级；`/auth/*` 保持公开。它提供 `ctx.webAuth.authenticated(cookie)` 供路由在传输准入后授权有效会话，并提供 `ctx.webAuth.renew(cookie, res)` 来续期会话。

会话采用滑动过期：每个已认证请求都会更新 `lastSeen` 并刷新 Cookie 的 `Max-Age`，因此持续活动期间无需重新认证。当会话空闲时长超过 `idleTimeoutMs`（默认 7 天）或即使持续使用也超过 `absoluteTimeoutMs` 上限（默认 30 天）时，会话过期。过期会话在下一次访问时被惰性清除。该插件不会持久化令牌或会话，也不提供静态存储加密；进程重启会清除所有会话，浏览器必须再次认证。

`off` 保留本地回环开发行为，并仍提供 `ctx.webAuth.authenticated(cookie)` 作为始终拒绝的会话验证器，使组合插件可以无条件注入该服务。

## 模型体验

无，因为该包只保护浏览器传输，不注册面向模型的内容。

#### KV Cache 影响

无；认证状态由浏览器 Cookie 携带，不会改变模型请求。

## 已知限制与后续工作

- **会话持久化** — 会话只存在于活动进程中；重启会清除会话并要求重新认证。滑动过期与空闲/绝对期限均为内存态、按进程隔离。
- **凭据存储** — 此包解析配置的凭据，但不加密静态凭据；配置的凭据提供方负责存储保护。
