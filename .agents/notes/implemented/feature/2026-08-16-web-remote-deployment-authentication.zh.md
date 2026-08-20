# Agent Note: 经过认证的远程 Web 部署

Status: implemented

[English](2026-08-16-web-remote-deployment-authentication.md) | 中文

## Problem

Web GUI 可以创建运行宿主本地工具的会话。因此非回环监听器不能只依赖现有的 Host 和 Origin 检查：这些检查能阻止 DNS 重绑定和跨站请求，却不能识别使用已接受 authority 的人。部署还需要 HTTPS，既包括 dsh 自己持有监听器的场景，也包括反向代理终止 TLS 的场景。

## Decision

`dsh web` 保持 `127.0.0.1` 上匿名 HTTP 的本地默认值。`--host 0.0.0.0` 要求 `--auth required`，并且必须提供成对的 `--tls-cert` / `--tls-key` 文件，或为终止 TLS 的反向代理提供 `--public-url https://…`。public URL authority 会加入 API Host 信任列表，不会信任 forwarded headers。

`dsh-host-web-auth/preflight` 通过 `ctx.credentials` 解析 `DSH_WEB_TOKEN`，并在 `webServer` 能激活前完成。`dsh-host-web-auth` 只在 `/auth/login` 接受令牌，使用常量时间比较，并创建随机内存会话。浏览器在 HttpOnly、SameSite=Strict、带 `Max-Age` 的 Cookie 中收到该会话；HTTPS 部署会设置 Secure。会话采用滑动过期：每个已认证请求都会刷新 `lastSeen` 并通过 `ctx.webAuth.renew(cookie, res)` 重写 Cookie 的 `Max-Age`，因此持续活动期间无需重新认证。会话在空闲超过 `idleTimeoutMs`（默认 7 天）或到达 `absoluteTimeoutMs` 上限（默认 30 天，即使持续使用）后过期；两者均为经过校验的 `Config` 字段。WebServer 请求和 upgrade guards 对静态文件、插件 bundle、API 调用和 WebSocket upgrade 都要求该 Cookie。`/auth/*` 保持公开；未认证 GET 请求会收到不加载应用 bundle 的最小登录文档。登出会使内存会话失效并过期 Cookie。

WebServer 持有可选 PEM 监听器设置和与传输无关的 guard 注册。它不持有凭据解析、令牌验证或浏览器会话状态。API Host/Origin 检查保持独立。连接插件允许有效 Web 会话访问 settings 和 credentials 的读写，使经过认证的远程浏览器能够初始化和配置；宿主桌面操作、agent preset 文档管理和由调用方指定地址的模型发现仍仅限回环。

## Alternatives considered

**在每个请求中放置 Bearer header。** 未采用，因为浏览器 WebSocket upgrade 和静态模块加载无法一致地附加 Authorization header；同源 HttpOnly Cookie 能覆盖每种浏览器传输，而不会向 JavaScript 暴露令牌。

**信任 `X-Forwarded-Proto` 或 `X-Forwarded-Host`。** 未采用，因为直接客户端可伪造 forwarded headers，除非监听器拥有明确的代理信任模型。配置的 public HTTPS URL 改为明确部署 authority。

**持久化浏览器会话或加密凭据存储。** 未采用，因为部署需求是传输机密性。会话会在重启后消失，现有仅所有者可读的凭据提供方仍负责存储的令牌。

## Consequences

远程部署在 `DSH_WEB_TOKEN` 缺失时会在绑定监听器前失败。反向代理必须转发与 `--public-url` 匹配的公共 Host header，或由运维人员用 `--trusted-host` 添加 authority。访问令牌不会进入 URL 参数、浏览器存储、会话日志、提示词或诊断。有效会话会授权远程 settings、credentials 和模型发现。驱动宿主桌面或管理 preset 文档的 RPC 仍仅限回环；模型发现属于同一认证会话下的宿主模型配置与执行权限。

## Verification

`packages/host/web-auth/tests/web-auth.spec.ts` 覆盖监听器激活前的 preflight 失败、拒绝与接受的登录、经过认证的 fallback 和 WebSocket 访问、登出失效、滑动 Cookie 续期、空闲超时过期、持续续期下的绝对寿命上限，以及 `absoluteTimeoutMs < idleTimeoutMs` 的错误配置拒绝。`packages/host/webserver/tests/webserver.spec.ts` 覆盖与 TLS 无关的请求和 upgrade guard 注册。`packages/bundle/web-app/tests/startup.spec.ts` 覆盖远程绑定、TLS 和 public URL 参数规则。
