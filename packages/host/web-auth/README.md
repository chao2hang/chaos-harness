# `@deepseek-ai/dsh-host-web-auth`

English | [中文](README.zh.md)

Token authentication for the WebServer transport. `required` resolves the configured credential before activation, serves a minimal login page to unauthenticated browser GETs, and maintains random in-memory sessions in an HttpOnly, SameSite cookie. The guard covers static resources, `/plugins`, `/api`, and WebSocket upgrades; `/auth/*` remains public.

`off` keeps the local loopback development behavior. The plugin does not persist tokens or sessions and does not provide at-rest encryption.

## Model Experience

None, as the package only protects the browser transport and registers no model-facing content.

#### KV Cache effect

None; authentication state is carried by browser cookies and does not alter model requests.

## Known Limitations and Deferred Work

- **Session lifetime** — sessions exist only in the active process, so a restart requires browsers to authenticate again.
- **Credential storage** — the package resolves the configured credential but does not encrypt credentials at rest; the configured credential provider owns storage protection.
