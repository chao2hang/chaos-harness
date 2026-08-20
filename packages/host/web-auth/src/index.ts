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

/** One in-memory session with its sliding and absolute deadlines. */
interface SessionRecord {
  /** Creation time (ms epoch); bounds the absolute lifetime cap. */
  createdAt: number
  /** Last activity time (ms epoch); bounds the idle timeout. */
  lastSeen: number
}

/** Request authentication state shared with routes that apply finer authorization. */
export interface WebAuth {
  /**
   * Test one Cookie header against the active in-memory sessions.
   *
   * Read-only with respect to the cookie: it never renews. A session past its
   * idle or absolute deadline is lazily removed and reported as unauthenticated.
   * Call {@link renew} on an authenticated request to extend the session and
   * refresh the browser cookie.
   * @param cookie - Cookie header supplied by an HTTP or Fetch request.
   * @returns whether the header identifies a currently valid Web session.
   */
  authenticated(cookie: string | undefined): boolean
  /**
   * Renew the session behind a cookie: stamp last activity and refresh the
   * browser cookie's `Max-Age`. Implements sliding expiration on authenticated
   * requests. No cookie is written when the session is absent or already
   * expired (those are removed instead), so callers invoke it after
   * {@link authenticated} returns true.
   * @param cookie - Cookie header supplied by the request to renew.
   * @param res - response that receives the refreshed `Set-Cookie` header.
   */
  renew(cookie: string | undefined, res: ServerResponse): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Process-local Web session verifier and rewriter. */
    webAuth: WebAuth
  }
}

/** The preflight result and carrier are required before guard registration. */
export const inject = [WEB_AUTH_TOKEN_SERVICE, 'webServer']

/** Plugin configuration. */
export interface Config {
  /** `off` preserves local anonymous development; `required` protects every non-auth path. */
  mode: WebAuthMode
  /** Set Secure on the session cookie for built-in or proxy TLS. */
  secureCookie: boolean
  /** Idle timeout (ms): a session with no activity for this long expires. Default 7 days. */
  idleTimeoutMs: number
  /** Absolute lifetime cap (ms): a session must re-authenticate after this even under continuous use. Default 30 days. */
  absoluteTimeoutMs: number
}

/** Default idle timeout: 7 days. */
const DEFAULT_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000
/** Default absolute lifetime cap: 30 days. */
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000

export const Config: z<Config> = z.object({
  mode: z.union([z.const('off'), z.const('required')]).default('off'),
  secureCookie: z.boolean().default(false),
  idleTimeoutMs: z.number().default(DEFAULT_IDLE_TIMEOUT_MS),
  absoluteTimeoutMs: z.number().default(DEFAULT_ABSOLUTE_TIMEOUT_MS),
})

const AUTH_PATH = '/auth'
const SESSION_PATH = `${AUTH_PATH}/session`
const LOGIN_PATH = `${AUTH_PATH}/login`
const LOGOUT_PATH = `${AUTH_PATH}/logout`
const SESSION_COOKIE = 'dsh_web_session'
const MAX_LOGIN_BODY_BYTES = 16 * 1024

/** Read a Cookie request header from an HTTP request. */
function cookieHeader(req: IncomingMessage): string | undefined {
  return req.headers.cookie
}

/** Parse one Cookie header into name/value entries. */
function cookiesOfHeader(cookie: string | undefined): Map<string, string> {
  const values = new Map<string, string>()
  for (const field of cookie?.split(';') ?? []) {
    const at = field.indexOf('=')
    if (at === -1) continue
    values.set(field.slice(0, at).trim(), field.slice(at + 1).trim())
  }
  return values
}

/** Render an HttpOnly, same-origin session cookie with a sliding Max-Age. */
function sessionCookie(value: string, secure: boolean, maxAgeMs: number): string {
  const maxAgeSec = Math.max(0, Math.floor(maxAgeMs / 1000))
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${maxAgeSec}`
}

/** Clear the browser's session cookie. */
function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=0`
}

/** Read a bounded JSON login body without reflecting its value in diagnostics. */
async function readLoginToken(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : /* v8 ignore next -- Node HTTP stream chunks are Buffers */ Buffer.from(chunk)
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
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>访问认证 · DeepSeek Harness</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 50 50\' fill=\'%234176e6\'%3E%3Cpath d=\'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479Z\'/%3E%3C/svg%3E\"><style>:root{--bg-page:#151517;--bg-card:rgba(27,27,28,0.85);--border-card:rgba(255,255,255,0.08);--text-main:#fafafa;--text-sub:#979da6;--text-muted:#676d75;--input-bg:#101114;--input-border:rgba(255,255,255,0.12);--input-focus:rgb(65,118,230);--input-ring:rgba(65,118,230,0.3);--btn-bg:rgb(65,118,230);--btn-hover:rgb(86,134,254);--btn-active:rgb(47,76,143);--btn-text:#ffffff;--err-bg:rgba(239,68,68,0.12);--err-border:rgba(239,68,68,0.25);--err-text:#f25a5a;--card-shadow:0 24px 48px -12px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.05);--radial-glow:radial-gradient(circle at 50% 0%,rgba(65,118,230,0.14) 0%,rgba(21,21,23,0) 70%);--icon-bg:linear-gradient(135deg,rgba(65,118,230,0.2),rgba(65,118,230,0.05));--icon-border:rgba(65,118,230,0.3)}@media(prefers-color-scheme:light){:root{--bg-page:#f8fafc;--bg-card:rgba(255,255,255,0.92);--border-card:rgba(0,0,0,0.08);--text-main:#0f1115;--text-sub:#61666b;--text-muted:#979da6;--input-bg:#f3f4f6;--input-border:rgba(0,0,0,0.12);--input-focus:rgb(65,118,230);--input-ring:rgba(65,118,230,0.2);--btn-bg:rgb(65,118,230);--btn-hover:rgb(86,134,254);--btn-active:rgb(47,76,143);--btn-text:#ffffff;--err-bg:rgba(239,68,68,0.08);--err-border:rgba(239,68,68,0.2);--err-text:#dc2626;--card-shadow:0 20px 40px -12px rgba(15,23,42,0.08),0 0 0 1px rgba(0,0,0,0.04);--radial-glow:radial-gradient(circle at 50% 0%,rgba(65,118,230,0.08) 0%,rgba(248,250,252,0) 70%);--icon-bg:linear-gradient(135deg,rgba(65,118,230,0.12),rgba(65,118,230,0.03));--icon-border:rgba(65,118,230,0.2)}}*{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:var(--bg-page);background-image:var(--radial-glow);color:var(--text-main);font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',sans-serif;padding:1.5rem;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.card{width:100%;max-width:24rem;padding:2.25rem 2rem 2rem;background:var(--bg-card);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--border-card);border-radius:1.25rem;box-shadow:var(--card-shadow);display:flex;flex-direction:column;align-items:center;text-align:center}.brand-icon{width:48px;height:48px;border-radius:12px;background:var(--icon-bg);border:1px solid var(--icon-border);display:flex;align-items:center;justify-content:center;color:rgb(65,118,230);margin-bottom:1rem;box-shadow:0 4px 16px rgba(65,118,230,0.15)}.brand-icon svg{width:28px;height:28px}.title{font-size:1.25rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:0.25rem}.subtitle{font-size:0.9rem;font-weight:500;color:var(--text-main);margin-bottom:0.5rem}.hint{font-size:0.85rem;color:var(--text-sub);line-height:1.45;margin-bottom:1.5rem}.form{width:100%;display:flex;flex-direction:column;gap:1rem}.field{display:flex;flex-direction:column;gap:0.4rem;text-align:left}.label{font-size:0.8rem;font-weight:500;color:var(--text-sub);letter-spacing:0.02em}.input-wrap{position:relative;display:flex;align-items:center}.input{width:100%;border-radius:0.6rem;padding:0.75rem 2.5rem 0.75rem 0.85rem;font:inherit;font-size:0.9rem;border:1px solid var(--input-border);background:var(--input-bg);color:inherit;outline:none;transition:border-color 0.2s,box-shadow 0.2s}.input:focus{border-color:var(--input-focus);box-shadow:0 0 0 3px var(--input-ring)}.toggle-pwd{position:absolute;right:0.6rem;background:none;border:none;padding:0.25rem;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;border-radius:0.35rem;transition:color 0.15s}.toggle-pwd:hover{color:var(--text-main)}.toggle-pwd.active{color:var(--input-focus)}.btn{width:100%;border-radius:0.6rem;padding:0.75rem 1rem;font:inherit;font-size:0.92rem;font-weight:600;border:none;background:var(--btn-bg);color:var(--btn-text);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;transition:background-color 0.2s,transform 0.15s,box-shadow 0.2s;margin-top:0.25rem}.btn:hover:not(:disabled){background:var(--btn-hover);transform:translateY(-1px);box-shadow:0 4px 12px rgba(65,118,230,0.35)}.btn:active:not(:disabled){background:var(--btn-active);transform:translateY(0);box-shadow:none}.btn:disabled{opacity:0.65;cursor:not-allowed}.spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#ffffff;border-radius:50%;animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.error{border-radius:0.5rem;padding:0.6rem 0.75rem;font-size:0.82rem;line-height:1.4;background:var(--err-bg);border:1px solid var(--err-border);color:var(--err-text);text-align:left;display:flex;align-items:center;gap:0.4rem}.footer{margin-top:1.5rem;font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem}.footer .dot{font-weight:700}</style></head><body><main class="card"><div class="brand-icon"><svg viewBox="0 0 50 50" fill="currentColor"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 10.9702 34.416C7.57568 30.4639 6.27588 25.5681 6.8999 19.728C7.52393 13.8879 11.3838 10.5918 16.2798 10.7441C18.4321 10.812 20.376 11.6641 22.1123 13.0957C23.0161 13.8398 23.832 14.6799 24.6323 15.52C25.4326 16.3601 26.2959 17.144 27.2476 17.8479C28.4326 18.728 29.7441 19.3438 31.1836 19.688C31.5474 19.7759 31.6816 19.9839 31.5317 20.3521C31.3818 20.7202 31.1094 21.0559 30.7393 21.2803C29.6274 21.9521 28.3906 22.3757 27.0957 22.5439C24.4722 22.8879 22.2598 22.0156 20.5039 20.0879C19.7715 19.2798 19.2437 18.3359 18.8418 17.3037C18.6606 16.8398 18.3359 16.6321 17.8477 16.7119C17.3594 16.7917 17.1519 17.1199 17.2002 17.616C17.3828 19.5117 18.1553 21.1357 19.4639 22.52C21.8481 25.0479 24.8438 26.072 28.2764 25.3281C30.6396 24.8159 32.7441 23.6396 34.4639 21.936C34.7324 21.6719 34.9922 21.4399 35.3477 21.5679C35.6318 21.6719 35.6235 21.968 35.5684 22.2402C34.623 26.8398 32.2285 30.4321 28.375 32.9678C27.0796 33.8237 25.686 34.4639 24.168 34.872C23.6875 35.0078 23.3633 35.2798 23.4194 35.8079C23.4756 36.3359 23.7764 36.5679 24.2637 36.5518C24.7505 36.5359 25.2456 36.4321 25.7246 36.2798C27.6074 35.6799 29.3521 34.8237 30.936 33.688C31.2598 33.4561 31.5518 33.4722 31.812 33.728C32.0723 33.9839 32.0322 34.2798 31.7876 34.5518C30.2969 36.2161 28.4878 37.3838 26.3984 38.072C25.7007 38.3037 24.9751 38.4077 24.3262 37.8398Z"/></svg></div><h1 class="title">DeepSeek Harness</h1><h2 class="subtitle">访问认证</h2><p class="hint">请输入当前部署配置的 Web 访问令牌以进入工作台</p><form id="login" class="form"><div class="field"><label for="token" class="label">访问令牌</label><div class="input-wrap"><input id="token" type="password" class="input" placeholder="输入访问令牌 (Token)" autocomplete="current-password" autofocus required aria-label="访问令牌"><button type="button" id="toggle-pwd" class="toggle-pwd" aria-label="显示或隐藏令牌" title="显示或隐藏令牌"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><button id="submit-btn" class="btn"><span id="btn-text">验证并继续</span><span id="btn-spinner" class="spinner" style="display:none"></span></button><div id="error" class="error" role="alert" style="display:none"></div></form><div class="footer"><span>DeepSeek Harness</span><span class="dot">·</span><span>安全会话保护</span></div></main><script>const form=document.querySelector(\'#login\'),token=document.querySelector(\'#token\'),error=document.querySelector(\'#error\'),submitBtn=document.querySelector(\'#submit-btn\'),btnText=document.querySelector(\'#btn-text\'),btnSpinner=document.querySelector(\'#btn-spinner\'),togglePwd=document.querySelector(\'#toggle-pwd\');togglePwd.addEventListener(\'click\',()=>{const isPwd=token.type===\'password\';token.type=isPwd?\'text\':\'password\';togglePwd.classList.toggle(\'active\',isPwd)});function showError(msg){error.textContent=msg;error.style.display=\'flex\'}function hideError(){error.textContent=\'\';error.style.display=\'none\'}function setLoading(loading){submitBtn.disabled=loading;btnText.style.display=loading?\'none\':\'inline\';btnSpinner.style.display=loading?\'inline-block\':\'none\'}form.addEventListener(\'submit\',async event=>{event.preventDefault();const val=token.value.trim();if(!val){showError(\'请输入访问令牌\');token.focus();return}hideError();setLoading(true);try{const response=await fetch(\'/auth/login\',{method:\'POST\',headers:{\'content-type\':\'application/json\'},body:JSON.stringify({token:val})});if(response.ok){location.replace(\'/\');return}if(response.status===401){showError(\'访问令牌不正确，请重新输入\')}else{showError(\'登录失败，请检查网络或稍后重试\')}token.select()}catch(e){showError(\'网络连接异常，请稍后重试\')}finally{setLoading(false)}})</script></body></html>'
}

/** Apply Web authentication routes and guards. */
export function apply(ctx: Context, config: Config): void {
  if (config.absoluteTimeoutMs < config.idleTimeoutMs) {
    throw new Error(`web-auth: absoluteTimeoutMs (${config.absoluteTimeoutMs}) must be >= idleTimeoutMs (${config.idleTimeoutMs})`)
  }
  const sessions = new Map<string, SessionRecord>()
  /** Resolve the session id carried by a Cookie header, if any. */
  const sessionIdOf = (cookie: string | undefined): string | undefined =>
    cookiesOfHeader(cookie).get(SESSION_COOKIE)
  /** True when `record` is past its idle or absolute deadline; the caller evicts on a true result. */
  const isExpired = (record: SessionRecord, now: number): boolean =>
    now - record.lastSeen > config.idleTimeoutMs || now - record.createdAt > config.absoluteTimeoutMs
  const webAuth: WebAuth = {
    authenticated(cookie) {
      const id = sessionIdOf(cookie)
      if (id === undefined) return false
      const record = sessions.get(id)
      if (record === undefined) return false
      if (isExpired(record, Date.now())) {
        sessions.delete(id)
        return false
      }
      return true
    },
    renew(cookie, res) {
      const id = sessionIdOf(cookie)
      if (id === undefined) return
      const record = sessions.get(id)
      if (record === undefined) return
      const now = Date.now()
      if (isExpired(record, now)) {
        sessions.delete(id)
        return
      }
      record.lastSeen = now
      const remainingAbsolute = config.absoluteTimeoutMs - (now - record.createdAt)
      res.setHeader('set-cookie', sessionCookie(id, config.secureCookie, Math.min(config.idleTimeoutMs, remainingAbsolute)))
    },
  }
  // The session verifier exists in every mode so dependents can inject it
  // unconditionally: in `off` mode the session map stays empty, so it always
  // rejects (loopback dev never consults it, because loopback passes the API
  // trust fence without one).
  ctx.provide('webAuth', webAuth)
  if (config.mode === 'off') return
  const tokenValue = ctx.webAuthToken.value
  /* v8 ignore next -- guarded by web-auth-preflight service dependency */
  if (tokenValue === undefined) throw new Error('web-auth: required preflight token is missing')
  const rejectRequest = (req: IncomingMessage, res: ServerResponse, pathname: string): boolean => {
    if (pathname.startsWith(AUTH_PATH)) return true
    if (webAuth.authenticated(cookieHeader(req))) {
      webAuth.renew(cookieHeader(req), res)
      return true
    }
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
    if (pathname.startsWith(AUTH_PATH) || webAuth.authenticated(cookieHeader(req))) return true
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
      const cookie = cookieHeader(req)
      const ok = webAuth.authenticated(cookie)
      if (ok) webAuth.renew(cookie, res)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ authenticated: ok }))
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
      const now = Date.now()
      sessions.set(id, { createdAt: now, lastSeen: now })
      res.writeHead(204, { 'set-cookie': sessionCookie(id, config.secureCookie, Math.min(config.idleTimeoutMs, config.absoluteTimeoutMs)), 'cache-control': 'no-store' })
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
      const id = sessionIdOf(cookieHeader(req))
      if (id !== undefined) sessions.delete(id)
      res.writeHead(204, { 'set-cookie': clearSessionCookie(config.secureCookie), 'cache-control': 'no-store' })
      res.end()
    },
  }), 'web-auth: logout route')
}

/** Cordis plugin module for Web authentication routes and guards. */
export default { name, inject, Config, apply }
