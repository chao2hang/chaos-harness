# Agent Note: Sliding session expiration for Web authentication

Status: implemented

English | [中文](2026-08-20-web-auth-sliding-session-expiration.zh.md)

## Problem

The Web authentication sessions introduced in [authenticated remote Web deployment](2026-08-16-web-remote-deployment-authentication.md) carried no cookie `Max-Age` and no expiry logic. A browser that closed — or a tab that the browser reclaimed — lost its cookie, because the absence of `Max-Age`/`Expires` made it a session-scoped cookie. There was no way for a person to stay logged in across browser restarts or to bound a leaked cookie's useful lifetime: sessions lived in a `Set<string>` that never expired and never refreshed.

## Decision

`dsh-host-web-auth` replaces the session `Set` with a `Map<string, SessionRecord>` carrying `createdAt` and `lastSeen` (ms epoch). Two validated `Config` fields bound every session:

- `idleTimeoutMs` (default 7 days): a session with no activity for this long expires.
- `absoluteTimeoutMs` (default 30 days): a session must re-authenticate after this even under continuous use.

`absoluteTimeoutMs < idleTimeoutMs` is a load-time misconfiguration and throws. The cookie gains a `Max-Age` equal to the active window: on login it is `min(idle, absolute)`; on renewal it shrinks toward the absolute deadline. `WebAuth` gains `renew(cookie, res)`, which stamps `lastSeen` and rewrites the cookie `Max-Age` on the response. The HTTP request guard and the `/auth/session` route call `renew` on every authenticated request, so continuous activity extends the idle window without re-authentication. The upgrade guard does not renew (a WebSocket has no response cookie to set). Expired sessions are lazily evicted on the next `authenticated` or `renew` call.

## Cookie Max-Age under renewal

Renewal writes `min(idleTimeoutMs, remainingAbsolute)` as the cookie `Max-Age`, where `remainingAbsolute = absoluteTimeoutMs - (now - createdAt)`. Near the absolute cap the cookie shortens below the idle window, so a browser that idles for the full idle window just before the cap still re-authenticates at the right time. A renewed cookie never claims a lifetime the server will not honor.

## Alternatives considered

**A separate `/auth/refresh` endpoint exchanging a refresh token.** Rejected because the minimal login page ships no JavaScript, and the shipped composition has no client-side timer that would call it. Sliding renewal in the guard needs no frontend change: every authenticated request the browser already makes extends the session.

**Persist sessions to survive process restart.** Rejected for the same reason recorded in the original note: transport confidentiality is the deployment requirement, and persistence adds at-rest state this package does not own. Sliding expiration is in-memory and per-process; a restart still clears every session. The README's Known Limitations records this explicitly.

**No absolute cap, only an idle timeout.** Rejected because a leaked cookie that stays in continuous use would never expire. The absolute cap bounds the worst case regardless of activity, which is the security property an all-interfaces deployment needs.

## Consequences

A person who stays active is not forced to re-authenticate for up to 30 days, and a cookie that falls idle for 7 days expires on its own. The cost is that a leaked cookie is useful for as long as the attacker keeps it active, bounded only by the absolute cap — the same trade-off any sliding-session design makes. Process restart still clears every session (documented as a Known Limitation); the idle and absolute deadlines are in-memory and per-process.

## Verification

`packages/host/web-auth/tests/web-auth.spec.ts` covers sliding cookie `Max-Age` refresh on both the guard path and the `/auth/session` route, idle-timeout expiry after the window elapses, the absolute cap enforced under continuous renewal (renewal loop keeps idle alive; only the cap ends the session), and the `absoluteTimeoutMs < idleTimeoutMs` misconfiguration rejection. The existing login, logout, and guard tests are unchanged in behavior.
