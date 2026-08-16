# Agent Note: Authenticated remote Web deployment

Status: implemented

English | [中文](2026-08-16-web-remote-deployment-authentication.zh.md)

## Problem

The Web GUI can create sessions that run host-local tools. A non-loopback listener therefore cannot rely on the existing Host and Origin checks: those checks prevent DNS rebinding and cross-site requests, but do not identify the person using an accepted authority. Deployments also need HTTPS both when dsh owns the listener and when a reverse proxy terminates TLS.

## Decision

`dsh web` keeps its local default of anonymous HTTP on `127.0.0.1`. `--host 0.0.0.0` requires `--auth required` and either paired `--tls-cert` / `--tls-key` files or `--public-url https://…` for a TLS-terminating reverse proxy. The public URL authority joins the API Host trust list without trusting forwarded headers.

`dsh-host-web-auth/preflight` resolves `DSH_WEB_TOKEN` through `ctx.credentials` before `webServer` can activate. `dsh-host-web-auth` accepts the token only at `/auth/login`, compares it in constant time, and creates a random in-memory session. The browser receives that session in an HttpOnly, SameSite=Strict cookie, with Secure set for HTTPS deployments. The WebServer request and upgrade guards require that cookie for static files, plugin bundles, API calls, and WebSocket upgrades. `/auth/*` remains public; unauthenticated GET requests receive a minimal login document that does not load application bundles. Logout invalidates the in-memory session and expires the cookie.

The WebServer owns optional PEM listener setup and the transport-agnostic guard registrations. It does not own credential resolution, token verification, or browser session state. The existing API Host/Origin fence remains separate and continues to protect privileged methods with its loopback rule.

## Alternatives considered

**Put the token in a Bearer header on every request.** Rejected because browser WebSocket upgrades and static module loading cannot consistently attach an Authorization header; a same-origin HttpOnly cookie covers every browser transport without exposing the token to JavaScript.

**Trust `X-Forwarded-Proto` or `X-Forwarded-Host`.** Rejected because direct clients can forge forwarded headers unless the listener has an explicit proxy trust model. The configured public HTTPS URL names the deployment authority instead.

**Persist browser sessions or encrypt the credential store.** Rejected because transport confidentiality is the deployment requirement. Sessions disappear on restart, and the existing owner-only credential provider remains responsible for stored tokens.

## Consequences

Remote deployments fail before binding their listener when `DSH_WEB_TOKEN` is absent. A reverse proxy must forward the public Host header matching `--public-url`, or operators must add the authority with `--trusted-host`. Access tokens never enter URL parameters, browser storage, session logs, prompts, or diagnostics. Existing loopback-only privileged RPC restrictions remain in effect after login.

## Verification

`packages/host/web-auth/tests/web-auth.spec.ts` exercises preflight failure before listener activation, rejected and accepted logins, authenticated fallback and WebSocket access, and logout invalidation. `packages/host/webserver/tests/webserver.spec.ts` covers TLS-neutral request and upgrade guard registration. `packages/bundle/web-app/tests/startup.spec.ts` covers the remote bind, TLS, and public URL argument rules.
