/**
 * ui-settings-maintenance apply wiring: declaration-aware section
 * registration, the injected connection face, and HMR collapse recovery.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import type { MaintenanceSectionInjected } from '../src/client/MaintenanceSection.tsx'
import { MaintenanceSection } from '../src/client/MaintenanceSection.tsx'

// The section asserts shipped Chinese copy, so it states the browser it assumes.
usePinnedBrowserLanguages('zh-CN')

const SLOT = 'settings.section'

/** An RPC response envelope in the successful shape the client face reads. */
function ok<T>(value: T) {
  return { rpcId: 'maintenance-test' as never, result: { ok: true as const, value } }
}

/** An RPC response envelope carrying a business refusal. */
function refused(code: string, message: string) {
  return { rpcId: 'maintenance-test' as never, result: { ok: false as const, error: { code, message, details: {} } } }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const restart = vi.fn(() => Promise.resolve(ok({ restarting: true as const })))
  const hostDescription = { getSnapshot: () => undefined, subscribe: () => () => {} }
  ctx.provide('connection', { api: { host: { restart } }, hostDescription, isLoopback: true } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, restart, hostDescription }
}

/** Declare the settings-section hole the way the settings shell does. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { [SLOT]: { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-maintenance browser plugin', () => {
  it('declares only the services the section registration reads', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the System section after its slot is declared', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries(SLOT)[0]!
    expect(entry.component).toBe(MaintenanceSection)
    expect(entry.options).toMatchObject({ id: 'maintenance', order: 30 })
    expect(entry.locale).toBe('settings.maintenance')
    expect(resolveSlotLabel(entry.options.label)).toBe('系统维护')
  })

  it('follows the active locale through the nav label thunk', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries(SLOT)[0]!

    b.locale.setLocale('en')

    expect(resolveSlotLabel(entry.options.label)).toBe('System')
  })

  it('injects the connection description source and an acknowledging restart', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const injected = (b.slots.entries(SLOT)[0]!.inject as unknown as () => MaintenanceSectionInjected)()
    expect(injected.hooks.hostDescription).toBe(b.hostDescription)

    await expect(injected.restart()).resolves.toBeUndefined()
    expect(b.restart).toHaveBeenCalledWith({})
  })

  it('reports a Host refusal as an error carrying its code and message', async () => {
    const b = await bench()
    declare(b.slots)
    b.restart.mockResolvedValueOnce(
      refused('restart-unavailable', 'this deployment provides no ctx.appRestart') as never,
    )
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const injected = (b.slots.entries(SLOT)[0]!.inject as unknown as () => MaintenanceSectionInjected)()

    await expect(injected.restart()).rejects.toThrow(
      'restart-unavailable: this deployment provides no ctx.appRestart',
    )
  })

  it('removes and restores the registration across slot collapse', async () => {
    const b = await bench()
    const undeclare = declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)

    undeclare()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declare(b.slots)
    expect(b.slots.entries(SLOT)).toHaveLength(1)

    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
  })
})
