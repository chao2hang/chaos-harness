/**
 * The restart handover over a real launcher-booted `dsh web` process.
 *
 * Everything below the RPC is process behavior no unit test reaches: whether
 * the launcher reproduces its own invocation, whether the successor survives
 * the predecessor's exit, and whether it binds the port the predecessor
 * released. The proof that a successor exists is that the port keeps serving
 * after the launched process itself has exited.
 */
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'

const dshBinScript = fileURLToPath(new URL('../src/bin.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

/** Boot plus successor boot, both paying the first-run TypeScript compile. */
const RESTART_E2E_TIMEOUT_MS = 180_000

/** Servers this suite started, with the home each one keeps writing to. */
const started: { port: number; home: string }[] = []

/**
 * Reserve a port by binding and releasing it. The successor's argv is the only
 * portable handle on a process that has left this process's session, so the
 * port must be an explicit literal rather than an OS-assigned `--port 0`.
 * @returns a port free at the moment of the call.
 */
async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as { port: number }
  await new Promise<void>(resolve => server.close(() => { resolve() }))
  return port
}

/**
 * Kill every `dsh web` process this suite started, matched by the port literal
 * in its argv. A successor runs in its own session, so no process-group signal
 * from this test can reach it.
 * @param port - the port whose servers should be terminated.
 */
async function killServersOn(port: number): Promise<void> {
  const listed = await execa('ps', ['-eo', 'pid=,args='], { reject: false })
  for (const line of listed.stdout.split('\n')) {
    if (!line.includes(`--port ${String(port)}`) || !line.includes('bin.ts')) continue
    const pid = Number(line.trim().split(/\s+/)[0])
    if (!Number.isInteger(pid)) continue
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone: the predecessor exits on its own during a handover, and
      // a failed assertion may leave either generation dead.
    }
  }
}

/** One `host.describe` round trip, or undefined while nothing is serving. */
async function describeHost(port: number): Promise<{ canRestart: boolean } | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/host.describe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'restart-e2e', method: 'host.describe', payload: {} }),
    })
    const body = await response.json() as { result: { ok: boolean; value?: { canRestart: boolean } } }
    return body.result.ok ? body.result.value : undefined
  } catch {
    // Connection refused between the predecessor's exit and the successor's bind.
    return undefined
  }
}

/**
 * Poll until the port serves `host.describe` again.
 * @param port - the served port.
 * @param timeoutMs - deadline for the successor to finish booting.
 * @returns the description, or undefined when the deadline passes.
 */
async function waitForServer(port: number, timeoutMs: number): Promise<{ canRestart: boolean } | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const description = await describeHost(port)
    if (description !== undefined) return description
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return undefined
}

// A live successor keeps writing to its home, so the process dies first and
// the directory goes afterwards.
afterEach(async () => {
  for (const { port, home } of started.splice(0)) {
    await killServersOn(port)
    await rm(home, { recursive: true, force: true })
  }
})

// ps -eo is the only handle on a session-detached successor; Windows has no
// equivalent here, and the successor would outlive the run un-killed.
describe.skipIf(process.platform === 'win32')('dsh web restart (real launcher process)', () => {
  it('replaces the serving process with a successor that binds the same port', async () => {
    const port = await reservePort()
    const home = await mkdtemp(join(tmpdir(), 'dsh-web-restart-'))
    started.push({ port, home })
    {
      const launch = resolveExampleLaunch({
        srcBin: dshBinScript,
        configArgs: ['web', '--host', '127.0.0.1', '--port', String(port), '--auth', 'off'],
        tsconfigPath,
        env: {
          DSH_HOME: home,
          DEEPSEEK_API_KEY: 'keyless-restart-no-call',
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      // A successor inherits the predecessor's stdio. Piping it here would
      // hand the successor a pipe whose read end dies with the predecessor,
      // killing the process this test exists to observe; a file descriptor
      // outlives the handover exactly as a terminal or a redirect does.
      const logPath = join(home, 'server.log')
      // node:child_process rather than execa: the successor must inherit a real
      // file descriptor, and every execa output mode proxies through a pipe
      // execa itself owns, which dies with the predecessor.
      const log = openSync(logPath, 'a')
      const predecessor = spawn(launch.command, launch.args, {
        env: { ...process.env, ...launch.env },
        stdio: ['ignore', log, log],
      })
      closeSync(log)
      const predecessorExit = new Promise<number | null>((resolve) => {
        predecessor.once('exit', (code) => { resolve(code) })
      })

      const before = await waitForServer(port, 90_000)
      expect(before, `server never came up. log:\n${readFileSync(logPath, 'utf8')}`).toBeDefined()
      // The launcher provides ctx.appRestart, so the gateway advertises it.
      expect(before?.canRestart).toBe(true)

      const acknowledgement = await fetch(`http://127.0.0.1:${String(port)}/api/host.restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'restart-e2e-go', method: 'host.restart', payload: {} }),
      })
      expect(await acknowledgement.json()).toMatchObject({ result: { ok: true, value: { restarting: true } } })

      // The acknowledgement precedes the stop, so this process really does end.
      expect(await predecessorExit).toBe(0)

      // Nothing this test launched is running now, so a served response can
      // only come from a successor the launcher started.
      const after = await waitForServer(port, 90_000)
      expect(after, `no successor bound the port. log:\n${readFileSync(logPath, 'utf8')}`).toBeDefined()
      expect(after?.canRestart).toBe(true)
      // The successor writes its own startup line to the inherited stdio.
      expect(readFileSync(logPath, 'utf8').match(/dsh web: /g)).toHaveLength(2)
    }
  }, RESTART_E2E_TIMEOUT_MS)
})
