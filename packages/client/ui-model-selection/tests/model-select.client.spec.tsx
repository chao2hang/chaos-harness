// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

afterEach(cleanup)

describe('ModelSelect reasoning effort', () => {
  it('renders adapter metadata and submits the effort as part of the session selection', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High',
    })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /思维强度/ }))
    const slider = screen.getByRole<HTMLInputElement>('slider', { name: '思维强度' })
    expect(slider.value).toBe('4')
    expect(slider.getAttribute('aria-valuetext')).toBe('High')
    expect(screen.getByText('MINIMAL')).toBeTruthy()

    fireEvent.change(slider, { target: { value: '6' } })
    expect(select).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
      expect(trigger.getAttribute('aria-label')).toBe('选择模型，当前 DeepSeek-V4-Flash，推理等级 Max')
    })
  })

  it('edits custom model capacities from the model picker', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      groups: [{
        id: 'custom',
        name: 'Custom',
        models: [{
          id: 'm', name: 'Custom M', reasoning,
          contextWindow: 256_000, maxTokens: 32_000, capabilitiesEditable: true,
        }],
      }],
      current: { provider: 'custom', model: 'm', reasoningEffort: 'high' },
    }))
    const select = vi.fn(async () => true)
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型，当前 Custom M/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /上下文窗口/ }))
    const context = screen.getByRole<HTMLInputElement>('slider', { name: '上下文窗口' })
    expect(context.getAttribute('aria-valuetext')).toBe('256K')
    fireEvent.change(context, { target: { value: '7' } })
    expect(select).not.toHaveBeenCalled()
    fireEvent.pointerUp(context)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'custom', model: 'm', reasoningEffort: 'high', contextWindow: 1_000_000,
      })
    })
  })

  it('falls back to the closest lower shared effort when switching models', async () => {
    const groups = [{
      id: 'provider',
      name: 'Provider',
      models: [
        { id: 'wide', name: 'Wide', reasoning },
        { id: 'narrow', name: 'Narrow', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] } },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      groups,
      current: { provider: 'provider', model: 'wide', reasoningEffort: 'max' },
    }))
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ groups, current: selection }))
      return true
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /当前 Wide/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Narrow' }))

    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'provider', model: 'narrow', reasoningEffort: 'high' })
      expect(screen.getByRole('alert').textContent).toContain('当前模型不支持 Max，已切换到 High')
    })
  })

  it('clears an explicit effort when the next model exposes no adjustable levels', async () => {
    const groups = [{
      id: 'provider',
      name: 'Provider',
      models: [
        { id: 'reasoner', name: 'Reasoner', reasoning },
        { id: 'plain', name: 'Plain' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      groups,
      current: { provider: 'provider', model: 'reasoner', reasoningEffort: 'max' },
    }))
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ groups, current: selection }))
      return true
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /当前 Reasoner/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plain' }))

    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'provider', model: 'plain' })
      expect(screen.getByRole('alert').textContent).toContain('已切换到 Default')
    })
  })

  it('offers provider default only when the adapter does not configure a model default', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'model',
          name: 'Model',
          reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] },
        }],
      }],
      current: { provider: 'provider', model: 'model' },
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', {
      name: '选择模型，当前 Model，推理等级 Default',
    }))
    fireEvent.click(screen.getByRole('menuitem', { name: /思维强度/ }))
    const slider = screen.getByRole<HTMLInputElement>('slider', { name: '思维强度' })
    expect(slider.getAttribute('aria-valuetext')).toBe('Default')
    fireEvent.change(slider, { target: { value: '4' } })
  })

  it('prompts for a selection when the current model is no longer advertised', () => {
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'removed-model' },
    }))
    const select = vi.fn().mockResolvedValue(true)
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: '选择模型' })
    expect(trigger.textContent).toContain('选择模型')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem', { name: /思维强度/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.queryByText('removed-model')).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
  })

  it('announces a rejected selection as a transient toast and keeps the in-menu strip for loads', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async () => {
      directory.set(state({ groups, status: 'error', error: 'model-unavailable: session already contains images' }))
      return false
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    const toast = await screen.findByRole('alert')
    expect(toast.textContent).toContain('模型操作失败：model-unavailable: session already contains images')
    // The selection failure does not render the in-menu load strip (no Retry).
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const load = vi.fn()
    render(<ModelSelect
      locked={false}
      available={false}
      directory={createSnapshotStore(state())}
      load={load}
      select={vi.fn().mockResolvedValue(false)}
      t={t}
    />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})
