# `@deepseek-ai/dsh-host-web-auth`

English | [中文](README.zh.md)

Token authentication for the WebServer transport. `required` resolves the configured credential before activation, serves a minimal login page to unauthenticated browser GETs, and maintains random in-memory sessions in an HttpOnly, SameSite cookie. The guard covers static resources, `/plugins`, `/api`, and WebSocket upgrades; `/auth/*` remains public. It provides `ctx.webAuth.authenticated(cookie)` for routes that need to authorize a valid session after transport admission, and `ctx.webAuth.renew(cookie, res)` to extend one.

Sessions use sliding expiration: each authenticated request stamps `lastSeen` and refreshes the cookie's `Max-Age`, so continuous activity never re-authenticates. A session expires when it has been idle longer than `idleTimeoutMs` (default 7 days) or exceeds the `absoluteTimeoutMs` cap (default 30 days) even under continuous use. Expired sessions are lazily evicted on the next access. The plugin does not persist tokens or sessions and does not provide at-rest encryption; a process restart clears every session and requires browsers to authenticate again.

`off` keeps the local loopback development behavior and still provides `ctx.webAuth.authenticated(cookie)` as an always-rejecting verifier, so composed plugins can inject the service unconditionally.

## Model Experience

None, as the package only protects the browser transport and registers no model-facing content.

#### KV Cache effect

None; authentication state is carried by browser cookies and does not alter model requests.

## Known Limitations and Deferred Work

- **Session persistence** — sessions live only in the active process; a restart clears them and requires re-authentication. Sliding expiration and the idle/absolute deadlines are in-memory and per-process.
- **Credential storage** — the package resolves the configured credential but does not encrypt credentials at rest; the configured credential provider owns storage protection.
