# Agent Note: restarting the Web server from Settings

Status: implemented

English | [中文](2026-08-19-web-server-self-restart.zh.md)

## Problem

Several changes a person makes in the Web GUI cannot take effect in the running process. The settings seam already declares `applies: 'restart'` per namespace, plugin additions and removals only reach a fresh Loader tree, and rebuilt module code is invisible to a process that already imported it. Until now the only way to apply any of them was to find the terminal that started `dsh --profile web` and restart it by hand — which an all-interfaces deployment reached from another machine cannot do at all.

## Decision

Restarting is a process replacement requested through the launcher, exposed as one Host RPC and one Settings section.

`@deepseek-ai/dsh-cmdline` gains `ctx.appRestart` beside the existing `ctx.appExit`. Both are launcher facts provided by `provideCmdline` before any tree entry mounts. `restart` is the one optional member of `CmdlineHost`: a launcher that cannot start a successor — an embedded host, or a surface whose lifetime a supervisor owns — omits it, `ctx.appRestart` stays absent, and consumers report the capability as unavailable. Substituting a plain exit there would stop the server with nothing to take over, which is strictly worse than refusing.

`apps/cli` implements the request. `createProcessShutdown` grows a `restart()` that arms a successor launch instead of taking a separate path: the launch runs at whichever terminal point the existing controller reaches — natural completion, disposal rejection, or the five-second force-exit. Arming rather than launching after disposal is what keeps a slow teardown a restart instead of silently degrading into a shutdown that leaves nothing serving. A signal disarms it, because an operator asking this process to stop outranks a queued restart and must not be handed a successor outside whatever supervision killed the predecessor. The successor is `spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)])`, detached with inherited stdio: `execArgv` carries `--import tsx/esm` on a source launch, and `argv` carries the profile, bind host, port, and TLS paths, so the successor serves the URL the browser is already pointed at.

`host.restart` is the gateway's half. It acknowledges first and asks the launcher `restartGraceMs` later (default 250 ms, a validated `ApiProxyService` config field) because a server that tore itself down inside the call could never answer. The grace buys the acknowledgement a flush; it is not load-bearing, since the caller observes the handover as an ordinary disconnect either way. `host.describe.canRestart` reports whether the capability exists at all, so a client omits the control rather than offering one that always fails, and a request without it answers `restart-unavailable`. Tree teardown cancels a pending handover, so disposal for any other reason cannot leave a successor nobody asked for.

`@deepseek-ai/dsh-client-ui-settings-maintenance` is the surface: a `settings.section` with id `maintenance` at order 30. It reads nothing of its own — status and restart availability both come from the connection's generation-scoped Host description — and gates the request behind a risk confirmation naming the attached-session count.

## Why the browser waits for a round trip

The acknowledgement proves nothing about the successor, so the section treats a restart as observable only as a disconnect followed by a return: it waits for the Host description to go absent and come back, and reports success only after both halves. A description republished while the predecessor is still answering does not end the wait, and a refused request does not later turn into a success when an unrelated reconnect lands. This reuses the connection's existing reconnect machine rather than adding a boot identifier to the wire: the reconnect the browser already performs is the evidence.

## Authorization

`host.restart` is authentication-gated in `dsh-client-connection`, not loopback-pinned like the native-desktop methods. Restarting ends every session on the host, so it does not belong on the plain browser-trust fence; but an all-interfaces deployment is exactly where nobody can reach a terminal to bring the server back, and an authenticated caller can already run commands as this process through any session's tools. Pinning it to loopback would be a fence beside an open gate that also removes the capability precisely where it matters most.

## Verification

Shutdown-controller tests pin the successor launch across natural completion, disposal rejection, and grace overrun, its suppression by a signal, and single launch for repeated requests; a separate spec pins the successor command line for both source and built-bin invocations. Gateway tests pin acknowledge-then-ask ordering under fake timers, coalescing inside one grace, cancellation on teardown, and the `restart-unavailable` refusal; schema tests pin both capability flags as required wire fields. The section's component spec covers the confirmation gate, the full round trip, and the two ways a wait must not falsely succeed. The assembled browser scenario covers the honest unavailable state, because the e2e scaffold boots the tree directly rather than through the launcher and so provides no `appRestart`.

Process behavior no unit test reaches — that the launcher reproduces its own invocation, that the successor survives its predecessor, and that it binds the port the predecessor released — is pinned by `apps/cli/tests/web-restart.e2e.ts` against a real launcher-booted `dsh web`. Its proof that a successor exists is that the port keeps serving after the launched process itself has exited with status 0.

## Alternatives considered

**Reload the Cordis config tree in place.** This keeps the connection alive and is much faster, but cannot reload already-imported module code, which is most of what a developer restarting the server wants. The launcher already recomposes patch layers live for `cordis.patch.yml` edits, so the in-place path exists for the cases it can serve.

**Let the gateway spawn the successor itself.** The gateway would have to know the process's own command line, its runtime flags, and when the tree finished disposing — all launcher facts. Routing through `ctx.appRestart` keeps process lifetime with the one component that already owns it.

**Add a boot identifier to `host.describe` so the browser can recognize the successor.** This adds a wire field to make an observation the reconnect already makes: a new generation's description only exists because the old connection died and a new handshake succeeded.

**Restart on a fixed exit code interpreted by a supervisor.** There is no supervisor in the shipped `dsh --profile web` deployment, and requiring one would make the feature unavailable exactly where it was asked for.

## Consequences

A person can apply restart-only settings, plugin changes, and rebuilt code from the GUI, including on a remote deployment. The cost is that the predecessor's sessions, downlinks, and in-flight turns end with it — the confirmation states this and names the count. A successor that never binds leaves the section reporting that it is still waiting; distinguishing a slow boot from a failed one needs Host-side evidence the browser cannot obtain after the Host is gone.

Inherited stdio carries one constraint onto whoever launches `dsh`. A terminal, a file, and a shell redirect all outlive the handover, but a pipe whose reader is the exiting parent does not, and the successor dies on its first write. A supervisor that captures this process's output must hand it a descriptor it keeps open across the restart — the restart e2e does exactly that, and piping instead is what made its first run fail.
