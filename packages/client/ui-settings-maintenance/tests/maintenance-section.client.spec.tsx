// @vitest-environment jsdom
/**
 * MaintenanceSection presentation behavior: status reporting, the confirmation
 * gate, and the disconnect-then-return round trip that is the only evidence a
 * browser has that a restart finished.
 */
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { HostDescription } from '@deepseek-ai/dsh-client-connection/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MaintenanceSection } from '../src/client/MaintenanceSection.tsx'
import type { MaintenanceSectionProps } from '../src/client/MaintenanceSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** The locale seat resolving through the shipped Chinese dictionary. */
const t = makeTranslate(zh)

const CONNECTED: HostDescription = {
  version: '1.2.3',
  cwd: '/srv/project',
  attachedSessions: 2,
  home: '/home',
  canOpenPath: true,
  canRestart: true,
}

/**
 * Mount the section with a caller-controlled description, standing in for the
 * connection's own source. The setter is what a real reconnect performs.
 */
function mount(initial: HostDescription | undefined, restart: () => Promise<void>) {
  let publish!: (next: HostDescription | undefined) => void
  function Harness() {
    const [description, setDescription] = useState(initial)
    publish = setDescription
    return (
      <MaintenanceSection {...({
        t,
        useHostDescription: (selector: (value: HostDescription | undefined) => unknown) =>
          selector(description),
        restart,
        close: () => {},
      } as unknown as MaintenanceSectionProps)}
      />
    )
  }
  render(<Harness />)
  return { publish: (next: HostDescription | undefined) => { act(() => { publish(next) }) } }
}

/** Walk the confirmation dialog the way a user does: acknowledge, then confirm. */
async function confirmRestart(): Promise<void> {
  await act(async () => { screen.getByRole('button', { name: zh['restart.action'] }).click() })
  await act(async () => { screen.getByRole('checkbox').click() })
  await act(async () => { screen.getByRole('button', { name: zh['restart.confirm'] }).click() })
}

describe('MaintenanceSection', () => {
  it('reports the connected server facts', () => {
    mount(CONNECTED, () => Promise.resolve())

    expect(screen.getByText('1.2.3')).toBeTruthy()
    expect(screen.getByText('/srv/project')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('reports the offline state and offers no restart without a description', () => {
    mount(undefined, () => Promise.resolve())

    expect(screen.getByText(zh['status.offline'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['restart.action'] })).toHaveProperty('disabled', true)
  })

  it('explains a host that cannot restart itself instead of offering the control', () => {
    mount({ ...CONNECTED, canRestart: false }, () => Promise.resolve())

    expect(screen.getByText(zh['restart.unavailable'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['restart.action'] })).toHaveProperty('disabled', true)
  })

  it('gates the request behind an acknowledged confirmation naming the active sessions', async () => {
    const restart = vi.fn(() => Promise.resolve())
    mount(CONNECTED, restart)

    await act(async () => { screen.getByRole('button', { name: zh['restart.action'] }).click() })
    expect(screen.getByText('当前有 2 个活动会话，重启会立即中断它们正在进行的回合。')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: zh['restart.confirm'] })
    expect(confirm).toHaveProperty('disabled', true)
    expect(restart).not.toHaveBeenCalled()

    await act(async () => { screen.getByRole('checkbox').click() })
    await act(async () => { confirm.click() })
    expect(restart).toHaveBeenCalledOnce()
  })

  it('abandons the request when the confirmation is cancelled', async () => {
    const restart = vi.fn(() => Promise.resolve())
    mount(CONNECTED, restart)

    await act(async () => { screen.getByRole('button', { name: zh['restart.action'] }).click() })
    await act(async () => { screen.getByRole('button', { name: zh['restart.cancel'] }).click() })

    expect(restart).not.toHaveBeenCalled()
    expect(screen.queryByText(zh['restart.pending'])).toBeNull()
  })

  it('waits through the whole disconnect and reports success only after the server returns', async () => {
    const view = mount(CONNECTED, () => Promise.resolve())
    await confirmRestart()

    expect(screen.getByText(zh['restart.pending'])).toBeTruthy()

    // A description republished while the predecessor is still answering is
    // not evidence of a successor: the wait continues.
    view.publish({ ...CONNECTED, attachedSessions: 1 })
    expect(screen.getByText(zh['restart.pending'])).toBeTruthy()

    view.publish(undefined)
    expect(screen.getByText(zh['restart.pending'])).toBeTruthy()

    view.publish(CONNECTED)
    expect(screen.getByText(zh['restart.done'])).toBeTruthy()
  })

  it('keeps the control unavailable while a restart is in flight', async () => {
    mount(CONNECTED, () => Promise.resolve())
    await confirmRestart()

    expect(screen.getByRole('button', { name: zh['restart.action'] })).toHaveProperty('disabled', true)
  })

  it('reports a refused request and leaves the control usable again', async () => {
    const restart = vi.fn(() => Promise.reject(new Error('restart-unavailable: no launcher')))
    mount(CONNECTED, restart)

    await confirmRestart()

    expect(screen.getByRole('alert').textContent).toBe('重启请求失败：restart-unavailable: no launcher')
    expect(screen.queryByText(zh['restart.pending'])).toBeNull()
    expect(screen.getByRole('button', { name: zh['restart.action'] })).toHaveProperty('disabled', false)
  })

  it('reports a non-Error rejection as its own text', async () => {
    // The injected face is a plugin closure over a transport, not a typed
    // same-process call, so a rejection reason is whatever the transport threw.
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error reason is the case under test
    mount(CONNECTED, () => Promise.reject('connection closed'))

    await confirmRestart()

    expect(screen.getByRole('alert').textContent).toBe('重启请求失败：connection closed')
  })

  it('does not mistake a later reconnect for the success of a failed request', async () => {
    const view = mount(CONNECTED, () => Promise.reject(new Error('boom')))
    await confirmRestart()

    view.publish(undefined)
    view.publish(CONNECTED)

    expect(screen.queryByText(zh['restart.done'])).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
