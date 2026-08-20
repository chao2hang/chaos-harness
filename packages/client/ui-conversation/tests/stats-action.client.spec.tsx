// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ConversationSnapshot, UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { StatsAction, type StatsActionProps } from '../src/client/chat/StatsAction.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

describe('StatsAction', () => {
  afterEach(() => {
    cleanup()
  })
  function makeProps(snapshot: Partial<ConversationSnapshot> = {}, projections: Record<string, unknown> = {}): StatsActionProps {
    const defaultSnapshot: ConversationSnapshot = {
      openState: 'open',
      composerPhase: 'ready',
      chat: {
        legacy: {
          nodes: [
            {
              kind: 'assistant',
              seq: 1,
              time: 1000,
              turn: 1,
              timing: { stepStartTime: 1000, completedTime: 2500, firstTokenTime: 1200 },
              content: [{ type: 'text', text: 'hello' }],
            } as never,
          ],
        },
      },
    } as unknown as ConversationSnapshot

    const fullSnapshot = { ...defaultSnapshot, ...snapshot }
    const useSession = ((sel: (s: ConversationSnapshot) => unknown) => sel(fullSnapshot)) as StatsActionProps['useSession']
    const useProjection = ((name: string) => projections[name]) as unknown as UseProjection

    return {
      useSession,
      useProjection,
      t,
    } as StatsActionProps
  }

  it('renders nothing when there are no steps and no tokens', () => {
    const props = makeProps({ chat: { legacy: { nodes: [] } } as never })
    const { container } = render(<StatsAction {...props} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a pill badge and opens/closes popup on click', () => {
    const props = makeProps()
    const { getByRole, queryByRole } = render(<StatsAction {...props} />)

    const button = getByRole('button', { name: '会话统计与性能' })
    expect(button).toBeTruthy()
    expect(queryByRole('dialog')).toBeNull()

    // Click to open
    act(() => {
      button.click()
    })
    expect(queryByRole('dialog')).toBeTruthy()

    // Click outside or press Escape
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(queryByRole('dialog')).toBeNull()
  })

  it('renders tokens and durations breakdown with projection values', () => {
    const props = makeProps(
      {},
      {
        tokenUsage: {
          uncachedInputTokens: 1000,
          cacheReadTokens: 500,
          cacheWriteTokens: 0,
          outputTokens: 200,
        },
        sessionStats: {
          turns: 2,
          steps: 4,
          llmMs: 3000,
          toolMs: 1500,
          ttftMs: 500,
          ttftSteps: 2,
          decodeMs: 2000,
          decodeTokens: 200,
        },
      },
    )

    const { getByRole, getByText } = render(<StatsAction {...props} />)
    const button = getByRole('button', { name: '会话统计与性能' })
    expect(getByText('1.7K tok · 100 tok/s')).toBeTruthy()

    act(() => {
      button.click()
    })

    expect(getByText('会话统计与性能')).toBeTruthy()
    expect(getByText('2 轮 · 4 步')).toBeTruthy()
    expect(getByText('平均生成速率')).toBeTruthy()
    expect(getByText('100 tok/s')).toBeTruthy()
    expect(getByText(/33%/)).toBeTruthy()
  })
})
