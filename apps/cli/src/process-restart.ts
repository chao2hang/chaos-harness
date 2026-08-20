/**
 * Successor launch for a restarting `dsh` invocation: the half of a restart
 * that starts the replacement, paired with the shutdown controller that owns
 * when it runs.
 * @module @deepseek-ai/dsh/process-restart
 */

import { spawn } from 'node:child_process'

/**
 * The command line that reproduces this invocation.
 *
 * Runtime flags and application arguments arrive on two different vectors and
 * both are load-bearing: a source launch carries `--import tsx/esm` in
 * `execArgv` (without it the successor cannot import TypeScript at all), while
 * the profile, bind host, port, and TLS paths sit in `argv`. Reproducing the
 * invocation verbatim is also what keeps a restart honest — the successor
 * serves the same URL the browser is already pointed at, instead of a
 * re-derived default.
 * @param execArgv - the runtime flags this process was started with.
 * @param argv - this process's full argument vector, executable included.
 * @returns the successor's arguments, excluding the executable itself.
 */
export function successorArgv(execArgv: readonly string[], argv: readonly string[]): string[] {
  return [...execArgv, ...argv.slice(1)]
}

/** The process facts a successor launch reproduces, injectable by tests. */
export interface SuccessorLaunchOptions {
  /** Spawns the successor; defaults to `node:child_process` spawn. */
  spawnProcess?: typeof spawn
  /** Reports a launch that never started, so a failed restart is visible rather than silent. */
  reportFailure?: (message: string) => void
}

/**
 * Start a successor of this process and detach from it.
 *
 * The successor gets its own session so it outlives both this process and any
 * group-wide signal aimed at it, and inherits stdio so its startup line lands
 * where the predecessor's did. This returns as soon as the child exists: the
 * successor is still booting, and binds the listening port only after this
 * process has exited and released it.
 *
 * Inherited stdio is the one constraint a caller can break: a terminal, a file,
 * and a shell redirect all outlive the handover, but a pipe whose reader is the
 * exiting parent does not, and the successor dies on its first write. A
 * supervisor that captures this process's output must therefore hand it a
 * descriptor it keeps open across the restart.
 * @param options - injectable spawn and failure report.
 */
export function launchSuccessor(options: SuccessorLaunchOptions = {}): void {
  const {
    spawnProcess = spawn,
    reportFailure = (message: string) => { process.stderr.write(`${message}\n`) },
  } = options
  const child = spawnProcess(
    process.execPath,
    successorArgv(process.execArgv, process.argv),
    { cwd: process.cwd(), env: process.env, stdio: 'inherit', detached: true },
  )
  // The predecessor exits immediately after this call, so a spawn failure has
  // no later surface to report on: without this listener Node raises the
  // unhandled 'error' as a crash that hides why nothing is serving.
  child.once('error', (error: Error) => {
    reportFailure(`dsh: restart failed to start a successor process: ${error.message}`)
  })
  child.unref()
}
