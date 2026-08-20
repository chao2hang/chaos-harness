/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-maintenance`.
 * @module @deepseek-ai/dsh-client-ui-settings-maintenance/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-maintenance'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-maintenance-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the section slot and dictionary registrations are
 * effect-owned with disposal proven by this package's plugin spec, and restart
 * progress is component-local state derived from the connection's own
 * description source. This package owns no mutable state of its own.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
