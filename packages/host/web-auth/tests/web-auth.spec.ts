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

async function load(token: string | undefined): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-web-auth-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-web-auth/preflight'",
    '  config:',
    '    mode: required',
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  inject: [webAuthToken]',
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-web-auth'",
    '  inject: [webAuthToken]',
    '  config:',
    '    mode: required',
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

describe('real Loader composition', () => {
  it('fails preflight before the WebServer listener activates when the token is absent', async () => {
    await expect(load(undefined)).rejects.toThrow('credential DSH_WEB_TOKEN is not configured')
    expect(context?.get('webServer')).toBeUndefined()
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
    expect(await loginPage.text()).toContain('Sign in')
    const rejected = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong token' }),
    })
    expect(rejected.status).toBe(401)
    const accepted = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'correct token' }),
    })
    expect(accepted.status).toBe(204)
    const cookie = accepted.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toMatch(/^dsh_web_session=/)
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
    expect(await (await request(port, '/', { headers: { cookie: cookie! } })).text()).toContain('Sign in')
  })
})
