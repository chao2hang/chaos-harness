/**
 * System settings plugin, browser half: registers the `settings.section` entry
 * that reports how this server is running and asks it to replace its own
 * process. Composing this plugin out of cordis.yml removes the section
 * entirely — the nav row disappears with its registration, and the Host's
 * `host.restart` simply goes uncalled.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings slot declarations plus the ctx.settingsScope merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { MaintenanceSection, type MaintenanceSectionInjected } from './MaintenanceSection.tsx'
import { en, zh } from './locales.ts'

export type {
  MaintenanceSectionInjected, MaintenanceSectionProps,
} from './MaintenanceSection.tsx'
export type { MaintenanceLocaleKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.maintenance'

/** Required services (cordis fiber inject); the target slot is awaited through `slots.inject()`. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the System section and its dictionaries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-maintenance: dictionaries')

  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle
  const restart: MaintenanceSectionInjected['restart'] = async () => {
    const response = await connection.api.host.restart({})
    // The acknowledgement is the only thing this call can report. Losing the
    // connection right after it is the success path, so a transport failure
    // raised here is only ever the Host declining before anything stopped.
    if (!response.result.ok) {
      throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
    }
  }
  const injected = (): MaintenanceSectionInjected => ({
    hooks: { hostDescription: connection.hostDescription },
    restart,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'maintenance',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, MaintenanceSection))
}
