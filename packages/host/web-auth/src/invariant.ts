/** Package-owned invariant companion for Web authentication. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-web-auth'

/** Cordis companion plugin name. */
export const name = 'host-web-auth-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the authentication plugin owns only route and guard
 * registrations, whose disposal is mechanically covered by WebServer's
 * registry invariant. Its in-memory session map is validated per request
 * (idle and absolute deadlines checked on every authenticated access) rather
 * than asserted as an independent observable relationship.
 */
const install: InvariantInstaller = (_ctx, _fail) => {}

/** Register the package's empty companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
