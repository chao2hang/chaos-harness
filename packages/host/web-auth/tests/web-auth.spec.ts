/** Real Loader coverage for token login, cookie sessions, and guard coverage. */
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CredentialProvider, type CredentialInfo, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import WebAuth from '../src/index.ts'
import WebAuthPreflight from '../src/preflight.ts'
import WebServer from '@deepseek-ai/dsh-host-webserver'

class TestCredentials extends CredentialProvider {
  constructor(ctx: Context, private readonly token: string | undefined) { super(ctx) }
  async resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return this.token === undefined ? undefined : { value: this.token, source: 'test' }
  }
  async describe(_ref: CredentialRef): Promise<CredentialInfo> { return { configured: this.token !== undefined, writable: false } }
  async set(_ref: CredentialRef, _value: string): Promise<void> { throw new Error('read-only') }
  async unset(_ref: CredentialRef): Promise<void> { throw new Error('read-only') }
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function load(token: string | undefined, mode: 'required' | 'off' = 'required', secureCookie = false, timeouts?: { idle?: number; absolute?: number }): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-web-auth-loader-'))
  const configPath = join(root, 'cordis.yml')
  const authConfig = [
    `    mode: ${mode}`,
    `    secureCookie: ${secureCookie}`,
    ...(timeouts?.idle !== undefined ? [`    idleTimeoutMs: ${timeouts.idle}`] : []),
    ...(timeouts?.absolute !== undefined ? [`    absoluteTimeoutMs: ${timeouts.absolute}`] : []),
  ]
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-web-auth/preflight'",
    '  config:',
    `    mode: ${mode}`,
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  inject: [webAuthToken]',
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-web-auth'",
    '  inject: [webAuthToken]',
    '  config:',
    ...authConfig,
    '',
  ].join('\n'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-host-web-auth/preflight', WebAuthPreflight],
    ['@deepseek-ai/dsh-host-web-auth', WebAuth],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.plugin(TestCredentials, token)
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  return context
}

async function request(port: number, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(port)}${path}`, init)
}

/** Resolve after `ms`; used to cross the short idle/absolute deadlines in the renewal tests. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('real Loader composition', () => {
  it('fails preflight before the WebServer listener activates when the token is absent', async () => {
    await expect(load(undefined)).rejects.toThrow('credential DSH_WEB_TOKEN is not configured')
    expect(context?.get('webServer')).toBeUndefined()
  })

  it('provides an always-rejecting session verifier in off mode so dependents can inject it', async () => {
    const loaded = await load(undefined, 'off')
    await loaded.loader.await()
    expect(loaded.webAuth.authenticated('dsh_web_session=anything')).toBe(false)
    expect(loaded.webServer).toBeDefined()
  })

  it('protects the fallback and upgrade routes with a cookie session', async () => {
    const loaded = await load('correct token')
    await loaded.loader.await()
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('APP') })
    loaded.webServer.registerUpgrade({ path: '/events', handler: (_req, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: dsh-test\r\n\r\n')
    } })

    const loginPage = await request(port, '/')
    expect(loginPage.status).toBe(200)
    expect(await loginPage.text()).toContain('访问认证')
    const rejected = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong token' }),
    })
    expect(rejected.status).toBe(401)
    const sessionBefore = await request(port, '/auth/session')
    expect(sessionBefore.status).toBe(200)
    expect(await sessionBefore.json()).toEqual({ authenticated: false })

    const nonGetSession = await request(port, '/auth/session', { method: 'POST' })
    expect(nonGetSession.status).toBe(405)

    const nonPostLogin = await request(port, '/auth/login', { method: 'GET' })
    expect(nonPostLogin.status).toBe(405)

    const nonPostLogout = await request(port, '/auth/logout', { method: 'GET' })
    expect(nonPostLogout.status).toBe(405)

    const unauthApi = await request(port, '/api', { method: 'POST' })
    expect(unauthApi.status).toBe(401)
    expect(await unauthApi.json()).toEqual({ authenticated: false })

    const invalidBody = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json',
    })
    expect(invalidBody.status).toBe(401)

    const unauthSocket = connect(port, '127.0.0.1')
    await once(unauthSocket, 'connect')
    const unauthResponse = once(unauthSocket, 'data')
    unauthSocket.write([
      'GET /events HTTP/1.1', `Host: 127.0.0.1:${String(port)}`,
      'Connection: Upgrade', 'Upgrade: dsh-test', '', '',
    ].join('\r\n'))
    const [unauthData] = await unauthResponse as [Buffer]
    expect(String(unauthData)).toContain('401 Unauthorized')
    unauthSocket.destroy()

    const unauthLogout = await request(port, '/auth/logout', { method: 'POST' })
    expect(unauthLogout.status).toBe(204)

    const nonStringToken = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 123 }),
    })
    expect(nonStringToken.status).toBe(401)

    const malformedCookieReq = await request(port, '/auth/session', {
      headers: { cookie: 'malformed_token_without_equals; dsh_web_session=not_a_session' },
    })
    expect(malformedCookieReq.status).toBe(200)
    expect(await malformedCookieReq.json()).toEqual({ authenticated: false })

    const nullBody = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null',
    })
    expect(nullBody.status).toBe(401)

    const overflowBody = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(20 * 1024) }),
    })
    expect(overflowBody.status).toBe(401)

    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'correct token' }),
    })
    expect(accepted.status).toBe(204)
    const cookie = accepted.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toMatch(/^dsh_web_session=/)

    const sessionAfter = await request(port, '/auth/session', { headers: { cookie: cookie! } })
    expect(sessionAfter.status).toBe(200)
    expect(await sessionAfter.json()).toEqual({ authenticated: true })
    expect(await (await request(port, '/', { headers: { cookie: cookie! } })).text()).toBe('APP')

    const socket = connect(port, '127.0.0.1')
    await once(socket, 'connect')
    const response = once(socket, 'data')
    socket.write([
      'GET /events HTTP/1.1', `Host: 127.0.0.1:${String(port)}`, `Cookie: ${cookie}`,
      'Connection: Upgrade', 'Upgrade: dsh-test', '', '',
    ].join('\r\n'))
    const [data] = await response as [Buffer]
    expect(String(data)).toContain('101 Switching Protocols')
    socket.destroy()

    const logout = await request(port, '/auth/logout', { method: 'POST', headers: { cookie: cookie! } })
    expect(logout.status).toBe(204)
    expect(await (await request(port, '/', { headers: { cookie: cookie! } })).text()).toContain('访问认证')
  })

  it('sets the Secure flag on session cookies when secureCookie is true', async () => {
    const loaded = await load('secure token', 'required', true)
    await loaded.loader.await()
    const port = loaded.webServer.port

    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'secure token' }),
    })
    expect(accepted.status).toBe(204)
    expect(accepted.headers.get('set-cookie')).toContain('Secure')
  })

  it('refreshes the cookie Max-Age on each authenticated request (sliding expiration)', async () => {
    const loaded = await load('correct token', 'required', false, { idle: 10_000, absolute: 30_000 })
    await loaded.loader.await()
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('APP') })

    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'correct token' }),
    })
    expect(accepted.status).toBe(204)
    // Login cookie Max-Age is min(idle, absolute) = 10s.
    expect(accepted.headers.get('set-cookie')).toContain('Max-Age=10')
    const cookie = accepted.headers.get('set-cookie')!.split(';', 1)[0]

    // An authenticated GET renews: the app body is served and the cookie Max-Age stays at the idle window.
    const app = await request(port, '/', { headers: { cookie: cookie! } })
    expect(await app.text()).toBe('APP')
    expect(app.headers.get('set-cookie')).toContain('Max-Age=10')

    // The session probe route also renews an authenticated session.
    const session = await request(port, '/auth/session', { headers: { cookie: cookie! } })
    expect(await session.json()).toEqual({ authenticated: true })
    expect(session.headers.get('set-cookie')).toContain('Max-Age=10')
  })

  it('expires a session after idleTimeoutMs of inactivity', async () => {
    const loaded = await load('correct token', 'required', false, { idle: 200, absolute: 10_000 })
    await loaded.loader.await()
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('APP') })

    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'correct token' }),
    })
    const cookie = accepted.headers.get('set-cookie')!.split(';', 1)[0]
    expect(await (await request(port, '/', { headers: { cookie: cookie! } })).text()).toBe('APP')

    // Idle window elapses with no activity; the next request must re-authenticate.
    await sleep(350)
    const after = await request(port, '/', { headers: { cookie: cookie! } })
    expect(await after.text()).toContain('访问认证')
    const sessionAfter = await request(port, '/auth/session', { headers: { cookie: cookie! } })
    expect(await sessionAfter.json()).toEqual({ authenticated: false })
  })

  it('enforces the absolute lifetime cap even under continuous renewal', async () => {
    const loaded = await load('correct token', 'required', false, { idle: 500, absolute: 1000 })
    await loaded.loader.await()
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('APP') })

    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'correct token' }),
    })
    const cookie = accepted.headers.get('set-cookie')!.split(';', 1)[0]
    // Renew repeatedly within the idle window so idle never expires; only the absolute cap can end the session.
    for (let i = 0; i < 3; i++) {
      await sleep(250)
      expect(await (await request(port, '/', { headers: { cookie: cookie! } })).text()).toBe('APP')
    }
    // Past the absolute cap: creation time governs, so the session is rejected despite a recent renewal.
    await sleep(350)
    const after = await request(port, '/', { headers: { cookie: cookie! } })
    expect(await after.text()).toContain('访问认证')
  })

  it('rejects configuration where absoluteTimeoutMs is less than idleTimeoutMs', async () => {
    // web-auth's apply is synchronous, so the throw settles in its fiber and surfaces via loader.await()
    // rather than rejecting load() directly (unlike the async preflight apply).
    const loaded = await load('correct token', 'required', false, { idle: 10_000, absolute: 1_000 })
    await expect(loaded.loader.await()).rejects.toThrow('absoluteTimeoutMs')
  })
})
