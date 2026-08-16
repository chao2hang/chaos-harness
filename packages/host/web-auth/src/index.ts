/** Token login and in-memory cookie sessions for WebServer deployments. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WEB_AUTH_TOKEN_SERVICE, type WebAuthMode } from './preflight.ts'

/** Stable Cordis plugin name. */
export const name = 'web-auth'

export type { WebAuthMode } from './preflight.ts'

/** The preflight result and carrier are required before guard registration. */
export const inject = [WEB_AUTH_TOKEN_SERVICE, 'webServer']

/** Plugin configuration. */
export interface Config {
  /** `off` preserves local anonymous development; `required` protects every non-auth path. */
  mode: WebAuthMode
  /** Set Secure on the session cookie for built-in or proxy TLS. */
  secureCookie: boolean
}

export const Config: z<Config> = z.object({
  mode: z.union([z.const('off'), z.const('required')]).default('off'),
  secureCookie: z.boolean().default(false),
})

const AUTH_PATH = '/auth'
const SESSION_PATH = `${AUTH_PATH}/session`
const LOGIN_PATH = `${AUTH_PATH}/login`
const LOGOUT_PATH = `${AUTH_PATH}/logout`
const SESSION_COOKIE = 'dsh_web_session'
const MAX_LOGIN_BODY_BYTES = 16 * 1024

/** Parse one Cookie request header into name/value entries. */
function cookiesOf(req: IncomingMessage): Map<string, string> {
  const values = new Map<string, string>()
  for (const field of req.headers.cookie?.split(';') ?? []) {
    const at = field.indexOf('=')
    if (at === -1) continue
    values.set(field.slice(0, at).trim(), field.slice(at + 1).trim())
  }
  return values
}

/** Render an HttpOnly, same-origin session cookie. */
function sessionCookie(value: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
}

/** Clear the browser's session cookie. */
function clearSessionCookie(secure: boolean): string {
  return `${sessionCookie('', secure)}; Max-Age=0`
}

/** Read a bounded JSON login body without reflecting its value in diagnostics. */
async function readLoginToken(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_LOGIN_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const token = (parsed as Record<string, unknown>).token
  return typeof token === 'string' ? token : undefined
}

/** Constant-time equality, including a length check that never indexes mismatched buffers. */
function matchesToken(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Return a fresh opaque session identifier. */
function newSessionId(): string {
  return randomBytes(32).toString('base64url')
}

/** Minimal login document served before any authenticated frontend asset. */
function loginPage(): string {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Harness</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101418;color:#edf2f7;font:16px system-ui,sans-serif}.card{width:min(22rem,calc(100vw - 3rem));padding:2rem;border:1px solid #34404c;border-radius:1rem;background:#182028}.wordmark{font-weight:700;letter-spacing:.16em;font-size:.78rem}.title{margin:1.5rem 0 .5rem;font-size:1.5rem}.hint{color:#afbac5;line-height:1.5}form{display:grid;gap:.75rem;margin-top:1.5rem}input,button{box-sizing:border-box;width:100%;border-radius:.5rem;padding:.75rem;font:inherit}input{border:1px solid #52606d;background:#101418;color:inherit}button{border:0;background:#57d0a1;color:#092218;font-weight:700;cursor:pointer}.error{min-height:1.25rem;color:#ff9b9b}</style><main class="card"><div class="wordmark">HARNESS</div><h1 class="title">Sign in</h1><p class="hint">Enter the Web access token supplied by this deployment.</p><form id="login"><input id="token" type="password" autocomplete="current-password" autofocus required aria-label="Access token"><button>Continue</button><div id="error" class="error" role="alert"></div></form></main><script>const form=document.querySelector(\'#login\'),token=document.querySelector(\'#token\'),error=document.querySelector(\'#error\');form.addEventListener(\'submit\',async event=>{event.preventDefault();error.textContent=\'\';const response=await fetch(\'/auth/login\',{method:\'POST\',headers:{\'content-type\':\'application/json\'},body:JSON.stringify({token:token.value})});if(response.ok){location.replace(\'/\');return}error.textContent=response.status===401?\'The access token was not accepted.\':\'Unable to sign in.\';token.select()})</script></html>'
}

/** Apply Web authentication routes and guards. */
export function apply(ctx: Context, config: Config): void {
  if (config.mode === 'off') return
  const tokenValue = ctx.webAuthToken.value
  if (tokenValue === undefined) throw new Error('web-auth: required preflight token is missing')
  const sessions = new Set<string>()
  const authenticated = (req: IncomingMessage): boolean => {
    const id = cookiesOf(req).get(SESSION_COOKIE)
    return id !== undefined && sessions.has(id)
  }
  const rejectRequest = (req: IncomingMessage, res: ServerResponse, pathname: string): boolean => {
    if (pathname.startsWith(AUTH_PATH)) return true
    if (authenticated(req)) return true
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(loginPage())
      return false
    }
    res.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end('{"authenticated":false}')
    return false
  }
  const rejectUpgrade = (req: IncomingMessage, socket: Duplex, pathname: string): boolean => {
    if (pathname.startsWith(AUTH_PATH) || authenticated(req)) return true
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return false
  }
  ctx.effect(() => ctx.webServer.registerGuard(rejectRequest), 'web-auth: HTTP guard')
  ctx.effect(() => ctx.webServer.registerUpgradeGuard(rejectUpgrade), 'web-auth: upgrade guard')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SESSION_PATH,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ authenticated: authenticated(req) }))
    },
  }), 'web-auth: session route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const token = await readLoginToken(req)
      if (token === undefined || !matchesToken(token, tokenValue)) {
        res.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end('{"authenticated":false}')
        return
      }
      const id = newSessionId()
      sessions.add(id)
      res.writeHead(204, { 'set-cookie': sessionCookie(id, config.secureCookie), 'cache-control': 'no-store' })
      res.end()
    },
  }), 'web-auth: login route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGOUT_PATH,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const id = cookiesOf(req).get(SESSION_COOKIE)
      if (id !== undefined) sessions.delete(id)
      res.writeHead(204, { 'set-cookie': clearSessionCookie(config.secureCookie), 'cache-control': 'no-store' })
      res.end()
    },
  }), 'web-auth: logout route')
}

/** Cordis plugin module for Web authentication routes and guards. */
export default { name, inject, Config, apply }
