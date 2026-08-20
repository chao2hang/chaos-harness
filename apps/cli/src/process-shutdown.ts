/** Bounded, escalating process shutdown for the long-lived CLI surfaces. */

/** Maximum grace allowed for the application tree to dispose before process exit. */
export const PROCESS_SHUTDOWN_TIMEOUT_MS = 5_000

/** Process-exit controller shared by normal completion and Unix signal handlers. */
export interface ProcessShutdown {
  /** Start or join graceful disposal before allowing natural completion with `code`. */
  shutdown(code: number): Promise<void>
  /** Start graceful disposal followed by exit, or force exit when shutdown is already running. */
  interrupt(code: number): void
  /**
   * Start or join graceful disposal, arming the successor launch that runs
   * once this process reaches its exit decision.
   *
   * Arming rather than launching at disposal's end is what keeps a restart a
   * restart: a tree that overruns its grace still hands off, so a slow
   * disposal degrades to an overlapping handover instead of silently becoming
   * a plain shutdown that leaves nothing serving. A signal disarms it, because
   * an operator asking this process to stop outranks a queued restart.
   */
  restart(): Promise<void>
}

/** Collaborators of one process-exit controller. */
export interface ProcessShutdownOptions {
  /** Whole-application teardown that resolves at quiescence. */
  dispose: () => Promise<void>
  /** Start this invocation's successor process; called at most once, immediately before exit. */
  launchSuccessor: () => void
  /** Exit the process immediately, replaceable by tests. */
  forceExit?: (code: number) => void
  /** Record the natural completion code, replaceable by tests. */
  complete?: (code: number) => void
  /** Grace before forced exit, replaceable by tests. */
  timeoutMs?: number
}

/**
 * Create one process-exit controller around an application disposer.
 * @param options - the disposer, the successor launcher, and the test-replaceable exit seams.
 * @returns A controller whose normal calls coalesce and whose repeated signal call escalates.
 */
export function createProcessShutdown(options: ProcessShutdownOptions): ProcessShutdown {
  const {
    dispose,
    launchSuccessor,
    forceExit = (code) => { process.exit(code) },
    complete = (code) => { process.exitCode = code },
    timeoutMs = PROCESS_SHUTDOWN_TIMEOUT_MS,
  } = options
  let pending: Promise<void> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let completed = false
  let forceExited = false
  let successorArmed = false
  let successorLaunched = false

  const clearExitTimeout = (): void => {
    /* v8 ignore else -- shutdown() arms the timer before any asynchronous exit path can run. */
    if (timeout !== undefined) clearTimeout(timeout)
  }

  // Runs on every terminal path so a restart survives a disposal that rejects
  // or overruns its grace. The predecessor's listening sockets are released by
  // its own exit, which lands long before the successor finishes booting.
  const launchSuccessorOnce = (): void => {
    if (!successorArmed || successorLaunched) return
    successorLaunched = true
    launchSuccessor()
  }

  const forceExitOnce = (code: number): void => {
    if (forceExited) return
    forceExited = true
    clearExitTimeout()
    launchSuccessorOnce()
    forceExit(code)
  }

  const completeOnce = (code: number): void => {
    if (completed || forceExited) return
    completed = true
    clearExitTimeout()
    launchSuccessorOnce()
    complete(code)
  }

  const start = (code: number, forceAfterDispose: boolean): Promise<void> => {
    if (pending !== undefined) return pending
    timeout = setTimeout(() => { forceExitOnce(code) }, timeoutMs)
    pending = Promise.resolve().then(dispose).then(
      () => {
        if (forceAfterDispose) forceExitOnce(code)
        else completeOnce(code)
      },
      () => { forceExitOnce(code) },
    )
    return pending
  }

  return {
    shutdown(code) {
      return start(code, false)
    },
    interrupt(code) {
      // A stop request outranks a restart already in flight: honoring both
      // would leave a successor this signal's sender never asked for and
      // cannot see, outside whatever supervision killed the predecessor.
      successorArmed = false
      if (pending !== undefined) {
        forceExitOnce(code)
        return
      }
      void start(code, true)
    },
    restart() {
      successorArmed = true
      return start(0, false)
    },
  }
}
