import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProcessShutdown,
  PROCESS_SHUTDOWN_TIMEOUT_MS,
} from '../src/process-shutdown.ts'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('process shutdown', () => {
  it('completes naturally after disposal resolves and forces exit when it rejects', async () => {
    const resolvedExit = vi.fn()
    const resolvedComplete = vi.fn()
    const resolved = createProcessShutdown({
      dispose: () => Promise.resolve(),
      launchSuccessor: vi.fn(),
      forceExit: resolvedExit,
      complete: resolvedComplete,
    })
    await resolved.shutdown(0)
    expect(resolvedComplete).toHaveBeenCalledOnce()
    expect(resolvedComplete).toHaveBeenCalledWith(0)
    expect(resolvedExit).not.toHaveBeenCalled()

    const rejectedExit = vi.fn()
    const rejectedComplete = vi.fn()
    const rejected = createProcessShutdown({
      dispose: () => Promise.reject(new Error('dispose failed')),
      launchSuccessor: vi.fn(),
      forceExit: rejectedExit,
      complete: rejectedComplete,
    })
    await rejected.shutdown(1)
    expect(rejectedExit).toHaveBeenCalledOnce()
    expect(rejectedExit).toHaveBeenCalledWith(1)
    expect(rejectedComplete).not.toHaveBeenCalled()
  })

  it('uses process.exitCode for default normal completion', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(_code => undefined as never)
    const originalExitCode = process.exitCode
    process.exitCode = undefined
    const shutdown = createProcessShutdown({
      dispose: () => Promise.resolve(),
      launchSuccessor: vi.fn(),
    })

    try {
      await shutdown.shutdown(7)

      expect(process.exitCode).toBe(7)
      expect(exit).not.toHaveBeenCalled()
    } finally {
      process.exitCode = originalExitCode
    }
  })

  it('forces exit when graceful disposal reaches its bound', async () => {
    vi.useFakeTimers()
    const disposal = deferred()
    const exit = vi.fn()
    const complete = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete,
    })
    const pending = shutdown.shutdown(0)

    await vi.advanceTimersByTimeAsync(PROCESS_SHUTDOWN_TIMEOUT_MS - 1)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)

    disposal.resolve()
    await pending
    expect(exit).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
  })

  it('honors a caller-supplied grace period', async () => {
    vi.useFakeTimers()
    const disposal = deferred()
    const exit = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete: vi.fn(),
      timeoutMs: 25,
    })
    const pending = shutdown.shutdown(0)

    await vi.advanceTimersByTimeAsync(24)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledOnce()

    disposal.resolve()
    await pending
  })

  it('lets Ctrl+C force a normal shutdown already stuck in disposal', async () => {
    const disposal = deferred()
    const exit = vi.fn()
    const complete = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete,
    })
    const pending = shutdown.shutdown(0)

    shutdown.interrupt(130)
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(130)

    disposal.resolve()
    await pending
    expect(exit).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
  })

  it('forces exit after disposal started by a signal', async () => {
    const disposal = deferred()
    const exit = vi.fn()
    const complete = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete,
    })

    shutdown.interrupt(143)
    disposal.resolve()
    await shutdown.shutdown(0)

    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(143)
    expect(complete).not.toHaveBeenCalled()
  })

  it('drains on the first signal and forces on the second signal', async () => {
    const disposal = deferred()
    const dispose = vi.fn(() => disposal.promise)
    const exit = vi.fn()
    const shutdown = createProcessShutdown({
      dispose,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete: vi.fn(),
    })

    shutdown.interrupt(143)
    await Promise.resolve()
    expect(dispose).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()

    shutdown.interrupt(130)
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(130)

    disposal.resolve()
    await shutdown.shutdown(0)
    expect(exit).toHaveBeenCalledOnce()
  })

  it('coalesces normal shutdown calls without treating them as escalation', async () => {
    const disposal = deferred()
    const exit = vi.fn()
    const complete = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete,
    })

    const first = shutdown.shutdown(0)
    const second = shutdown.shutdown(1)
    expect(second).toBe(first)
    expect(exit).not.toHaveBeenCalled()

    disposal.resolve()
    await first
    expect(complete).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith(0)
    expect(exit).not.toHaveBeenCalled()
  })

  it('lets a signal force exit while natural completion drains remaining handles', async () => {
    const exit = vi.fn()
    const complete = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => Promise.resolve(),
      launchSuccessor: vi.fn(),
      forceExit: exit,
      complete,
    })

    await shutdown.shutdown(0)
    shutdown.interrupt(130)

    expect(complete).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(130)
  })
})

describe('process restart', () => {
  it('disposes, then launches the successor before recording natural completion', async () => {
    const order: string[] = []
    const disposal = deferred()
    const shutdown = createProcessShutdown({
      dispose: () => { order.push('dispose'); return disposal.promise },
      launchSuccessor: () => order.push('launch'),
      forceExit: () => order.push('force-exit'),
      complete: () => order.push('complete'),
    })

    const pending = shutdown.restart()
    await Promise.resolve()
    expect(order).toEqual(['dispose'])

    disposal.resolve()
    await pending
    expect(order).toEqual(['dispose', 'launch', 'complete'])
  })

  it('launches the successor even when disposal overruns its grace', async () => {
    vi.useFakeTimers()
    const disposal = deferred()
    const launch = vi.fn()
    const exit = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: launch,
      forceExit: exit,
      complete: vi.fn(),
      timeoutMs: 25,
    })
    const pending = shutdown.restart()

    await vi.advanceTimersByTimeAsync(25)
    expect(launch).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)

    disposal.resolve()
    await pending
    expect(launch).toHaveBeenCalledOnce()
  })

  it('launches the successor when disposal rejects', async () => {
    const launch = vi.fn()
    const exit = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => Promise.reject(new Error('dispose failed')),
      launchSuccessor: launch,
      forceExit: exit,
      complete: vi.fn(),
    })

    await shutdown.restart()

    expect(launch).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('leaves no successor behind when a signal supersedes a restart in flight', async () => {
    const disposal = deferred()
    const launch = vi.fn()
    const exit = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: launch,
      forceExit: exit,
      complete: vi.fn(),
    })

    const pending = shutdown.restart()
    shutdown.interrupt(130)

    expect(exit).toHaveBeenCalledWith(130)
    expect(launch).not.toHaveBeenCalled()

    disposal.resolve()
    await pending
    expect(launch).not.toHaveBeenCalled()
  })

  it('starts one successor for repeated restart requests', async () => {
    const disposal = deferred()
    const launch = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => disposal.promise,
      launchSuccessor: launch,
      forceExit: vi.fn(),
      complete: vi.fn(),
    })

    const first = shutdown.restart()
    expect(shutdown.restart()).toBe(first)

    disposal.resolve()
    await first
    expect(launch).toHaveBeenCalledOnce()
  })

  it('starts no successor for a plain shutdown', async () => {
    const launch = vi.fn()
    const shutdown = createProcessShutdown({
      dispose: () => Promise.resolve(),
      launchSuccessor: launch,
      forceExit: vi.fn(),
      complete: vi.fn(),
    })

    await shutdown.shutdown(0)

    expect(launch).not.toHaveBeenCalled()
  })
})
