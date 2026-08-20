import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { launchSuccessor, successorArgv } from '../src/process-restart.ts'

/** A spawn stub that records its call and hands back a controllable child. */
function fakeSpawn(): {
  spawnProcess: (command: string, args: readonly string[], options: object) => ChildProcess
  calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[]
  child: EventEmitter & { unref: () => void }
  unrefs: number
} {
  const calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[] = []
  let unrefs = 0
  const child = Object.assign(new EventEmitter(), { unref: () => { unrefs += 1 } })
  return {
    calls,
    child,
    get unrefs() { return unrefs },
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options: options as Record<string, unknown> })
      return child as unknown as ChildProcess
    },
  }
}

describe('successor command line', () => {
  it('keeps the runtime flags a source launch needs ahead of the app arguments', () => {
    expect(successorArgv(
      ['--import', 'tsx/esm'],
      ['/usr/bin/node', '/repo/apps/cli/src/bin.ts', 'web', '--port', '3080'],
    )).toEqual(['--import', 'tsx/esm', '/repo/apps/cli/src/bin.ts', 'web', '--port', '3080'])
  })

  it('reproduces a built-bin invocation that carries no runtime flags', () => {
    expect(successorArgv(
      [],
      ['/usr/bin/node', '/opt/dsh/lib/bin.js', '--profile', 'web'],
    )).toEqual(['/opt/dsh/lib/bin.js', '--profile', 'web'])
  })
})

describe('successor launch', () => {
  it('spawns this executable detached with inherited stdio and releases the handle', () => {
    const spawn = fakeSpawn()

    launchSuccessor({ spawnProcess: spawn.spawnProcess as never })

    expect(spawn.calls).toHaveLength(1)
    const call = spawn.calls[0]!
    expect(call.command).toBe(process.execPath)
    expect(call.args).toEqual(successorArgv(process.execArgv, process.argv))
    expect(call.options).toMatchObject({ cwd: process.cwd(), stdio: 'inherit', detached: true })
    expect(spawn.unrefs).toBe(1)
  })

  it('reports a spawn failure instead of crashing the exiting predecessor', () => {
    const spawn = fakeSpawn()
    const reportFailure = vi.fn()

    launchSuccessor({ spawnProcess: spawn.spawnProcess as never, reportFailure })
    spawn.child.emit('error', new Error('ENOENT'))

    expect(reportFailure).toHaveBeenCalledOnce()
    expect(reportFailure.mock.calls[0]![0]).toContain('restart failed to start a successor process')
    expect(reportFailure.mock.calls[0]![0]).toContain('ENOENT')
  })
})
