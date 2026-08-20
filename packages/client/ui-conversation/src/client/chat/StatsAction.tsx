// Session header utilities entry: displays a compact stats pill in the
// upper-right corner that expands into a floating breakdown popover on click.

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from '../locales.ts'
import { formatTokensPerSecond } from './message-chrome.ts'
import {
  billedInputTokens, cacheHitPercent, deriveStats, formatDuration, formatTokens,
} from './StatsLine.tsx'
import css from './StatsAction.module.css'

/**
 * Props for {@link StatsAction}: the session header utilities slot share and
 * the locale face for stats copy.
 */
export type StatsActionProps =
  PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>

/**
 * Compact token/time pill in the header utilities that expands into a floating
 * breakdown popover on click. Renders nothing when no stats are available.
 * @param props - runtime slot share (session/projection hooks) plus locale.
 * @returns the trigger button and, while open, the breakdown popover.
 */
export const StatsAction = memo(function StatsAction({ useSession, useProjection, t }: StatsActionProps) {
  const settledNodes = useSession(s => s.chat.legacy.nodes)
  const usage = useProjection('tokenUsage')
  const projected = useProjection('sessionStats')
  const stats = useMemo(() => projected ?? deriveStats(settledNodes), [projected, settledNodes])

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const totalTokens = usage !== undefined ? billedInputTokens(usage) + usage.outputTokens : 0
  const totalMs = stats.llmMs + stats.toolMs
  const hasStats = stats.steps > 0 || totalTokens > 0

  if (!hasStats) return null

  // Summary pill text in the header utilities
  const summaryParts: string[] = []
  if (totalTokens > 0) summaryParts.push(`${formatTokens(totalTokens)} tok`)
  if (stats.decodeMs > 0 && stats.decodeTokens > 0) {
    const tps = formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))
    summaryParts.push(`${tps} tok/s`)
  } else if (totalMs > 0) {
    summaryParts.push(formatDuration(totalMs))
  }
  if (summaryParts.length === 0 && stats.steps > 0) {
    summaryParts.push(`${stats.turns}T / ${stats.steps}S`)
  }

  const cacheHit = usage !== undefined ? cacheHitPercent(usage) : null

  return (
    <div ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.trigger}
        data-active={open || undefined}
        aria-label={t('stats.title')}
        aria-expanded={open}
        onClick={() => { setOpen(prev => !prev) }}
      >
        <span className={css.icon} aria-hidden>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L6 9l-3-3" />
            <path d="M2 14h12" />
          </svg>
        </span>
        <span className={css.text}>{summaryParts.join(' · ')}</span>
      </button>

      {open && (
        <div className={css.popover} role="dialog" aria-modal="false">
          <div className={css.popoverHeader}>
            <span>{t('stats.title')}</span>
          </div>

          {stats.steps > 0 && (
            <div className={css.section}>
              <div className={css.sectionTitle}>{t('stats.section.counts')}</div>
              <div className={css.itemRow}>
                <span>{t('stats.counts', { turns: stats.turns, steps: stats.steps })}</span>
              </div>
            </div>
          )}

          {(stats.llmMs > 0 || stats.toolMs > 0) && (
            <div className={css.section}>
              <div className={css.sectionTitle}>{t('stats.section.durations')}</div>
              {stats.llmMs > 0 && (
                <div className={css.itemRow}>
                  <span>{t('stats.llm', { duration: '' }).trim()}</span>
                  <span className={css.itemValue}>{formatDuration(stats.llmMs)}</span>
                </div>
              )}
              {stats.toolMs > 0 && (
                <div className={css.itemRow}>
                  <span>{t('stats.toolCall', { duration: '' }).trim()}</span>
                  <span className={css.itemValue}>{formatDuration(stats.toolMs)}</span>
                </div>
              )}
            </div>
          )}

          {(stats.ttftSteps > 0 || stats.decodeMs > 0) && (
            <div className={css.section}>
              <div className={css.sectionTitle}>{t('stats.section.performance')}</div>
              {stats.ttftSteps > 0 && (
                <div className={css.itemRow}>
                  <span>{t('stats.ttftAverage', { duration: '' }).trim()}</span>
                  <span className={css.itemValue}>{formatDuration(stats.ttftMs / stats.ttftSteps)}</span>
                </div>
              )}
              {stats.decodeMs > 0 && (
                <div className={css.itemRow}>
                  <span>{t('stats.averageSpeed')}</span>
                  <span className={css.itemValue}>
                    {formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s
                  </span>
                </div>
              )}
            </div>
          )}

          {usage !== undefined && totalTokens > 0 && (
            <div className={css.section}>
              <div className={css.sectionTitle}>{t('stats.section.tokens')}</div>
              <div className={css.itemRow}>
                <span>{t('stats.tokens', { input: formatTokens(billedInputTokens(usage)), output: formatTokens(usage.outputTokens) })}</span>
              </div>
              {cacheHit !== null && (
                <div className={css.itemRow}>
                  <span>{t('stats.cacheHit', { percent: cacheHit })}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
