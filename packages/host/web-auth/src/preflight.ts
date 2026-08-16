/** Credential preflight that blocks remote Web listener activation until token resolution succeeds. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'

/** Service key emitted after Web authentication policy preflight. */
export const WEB_AUTH_TOKEN_SERVICE = 'webAuthToken'

/** Authentication modes supported by the Web shell. */
export type WebAuthMode = 'off' | 'required'

/** Process-local Web authentication token state. */
export interface WebAuthToken {
  /** Authentication mode selected by the invocation. */
  mode: WebAuthMode
  /** Resolved token while authentication is required. */
  value?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Process-local Web authentication policy and resolved token. */
    webAuthToken: WebAuthToken
  }
}

/** Stable Cordis plugin name. */
export const name = 'web-auth-preflight'

/** Credential resolution is required before publishing the preflight result. */
export const inject = ['credentials']

/** Authentication preflight configuration. */
export interface Config {
  /** `off` preserves local anonymous development; `required` resolves the configured token. */
  mode: WebAuthMode
  /** Credential reference containing the login token. */
  tokenRef: string
}

export const Config: z<Config> = z.object({
  mode: z.union([z.const('off'), z.const('required')]).default('off'),
  tokenRef: z.string().default('DSH_WEB_TOKEN'),
})

/** Resolve the configured token before dependent network services activate. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (config.mode === 'off') {
    ctx.provide(WEB_AUTH_TOKEN_SERVICE, { mode: 'off' })
    return
  }
  const tokenRef = credentialRef(config.tokenRef)
  const configured = await ctx.credentials.resolve(tokenRef)
  if (configured === undefined) throw new Error(`web-auth: credential ${tokenRef} is not configured`)
  ctx.provide(WEB_AUTH_TOKEN_SERVICE, { mode: 'required', value: configured.value })
}

/** Cordis plugin module for credential preflight. */
export default { name, inject, Config, apply }
