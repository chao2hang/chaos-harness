/**
 * The web app's command-line provider: it parses the `dsh --profile web` flag
 * family (`--host`, `--port`, `--trusted-host`, `--auth`, `--no-open`, and deployment flags) and its `--help`
 * text, then provides the immutable values as {@link WEB_STARTUP_SERVICE}.
 * Ordinary rows inject that service before reading it from lazy config.
 * @module @deepseek-ai/dsh-web-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'web-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** Supported Web authentication policies. */
export type WebAuthMode = 'off' | 'required'

/** What the web rows read from {@link WEB_STARTUP_SERVICE}. */
export interface WebStartupValues {
  /** Authentication policy selected by `--auth`; defaults to `off`. */
  auth: WebAuthMode
  /** Whether this invocation opens the default browser after startup. */
  openBrowser: boolean
  /** `--host`, absent when the invocation did not name one. */
  host?: string
  /** `--port`, absent when the invocation did not name one. */
  port?: number
  /** External HTTPS URL when TLS terminates at a reverse proxy. */
  publicUrl?: string
  /** Built-in HTTPS certificate path. */
  tlsCert?: string
  /** Built-in HTTPS private-key path. */
  tlsKey?: string
  /** Explicit `--trusted-host` authorities, in argument order. */
  trustedHosts: string[]
}

/** The web flag family, as commander parsed it. */
interface WebOptions {
  auth: string
  host?: string
  open: boolean
  port?: string
  publicUrl?: string
  tlsCert?: string
  tlsKey?: string
  trustedHost?: string[]
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function parseAuthMode(program: Command, value: string): WebAuthMode {
  if (value === 'off' || value === 'required') return value
  program.error(`error: --auth must be "off" or "required", got ${JSON.stringify(value)}`)
  throw new Error('unreachable')
}

function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--auth <mode>', 'authentication policy (off or required)', 'off')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--public-url <https URL>', 'external HTTPS URL when TLS terminates at a reverse proxy')
    .option('--tls-cert <path>', 'built-in HTTPS certificate path')
    .option('--tls-key <path>', 'built-in HTTPS private-key path')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
`)
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. All-interface
 * binds require authentication and HTTPS, either from the built-in listener or
 * an HTTPS reverse-proxy URL. Invalid deployment values are usage errors, so on
 * rejection (and on `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts<WebOptions>()
    const auth = parseAuthMode(program, options.auth)
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    if ((options.tlsCert === undefined) !== (options.tlsKey === undefined)) {
      program.error('error: --tls-cert and --tls-key must be provided together')
    }
    if (options.publicUrl !== undefined) {
      let parsed: URL
      try {
        parsed = new URL(options.publicUrl)
      } catch {
        program.error(`error: --public-url must be a valid HTTPS URL, got ${JSON.stringify(options.publicUrl)}`)
        return
      }
      if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
        program.error(`error: --public-url must be a valid HTTPS URL without credentials, got ${JSON.stringify(options.publicUrl)}`)
      }
    }
    if (options.host === '0.0.0.0') {
      if (auth !== 'required') {
        program.error('error: --host 0.0.0.0 requires --auth required')
      }
      if (options.tlsCert === undefined && options.publicUrl === undefined) {
        program.error('error: --host 0.0.0.0 requires paired --tls-cert/--tls-key or an HTTPS --public-url')
      }
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      auth,
      openBrowser: options.open,
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      ...options.publicUrl !== undefined && { publicUrl: options.publicUrl },
      ...options.tlsCert !== undefined && { tlsCert: options.tlsCert },
      ...options.tlsKey !== undefined && { tlsKey: options.tlsKey },
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
