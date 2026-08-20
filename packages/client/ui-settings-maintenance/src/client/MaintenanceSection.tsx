/**
 * The System settings section: a read-only view of how this server is running,
 * and the control that replaces its process.
 */
import { useEffect, useRef, useState } from 'react'
import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client'
import { Button, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings slot declarations this component's entry belongs to.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MaintenanceLocaleKey } from './locales.ts'
import css from './MaintenanceSection.module.css'

/** Registration-side business face for the System section. */
export interface MaintenanceSectionInjected {
  hooks: {
    /**
     * The connection's own generation-scoped Host facts. It is the section's
     * progress signal as well as its data: the value goes absent when the
     * predecessor stops answering and returns when the successor completes a
     * handshake, which is exactly the span a restart occupies.
     */
    hostDescription: HostDescriptionSource
  }
  /**
   * Ask the Host to replace its process. Resolves once the acknowledgement
   * lands — never once the successor is serving, which this browser learns
   * only by reconnecting. Rejects with display text when the Host refuses.
   */
  restart: () => Promise<void>
}

/** Props the renderer binds for the section. */
export type MaintenanceSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.maintenance'>
  & InjectFace<MaintenanceSectionInjected>

/**
 * What the section is showing about the last restart it requested.
 *
 * `restarting` covers the whole span from acknowledgement to reconnection,
 * because a browser cannot distinguish "stopping", "booting", and "binding"
 * from the outside — it only sees the connection go and come back.
 */
type RestartPhase = 'idle' | 'restarting' | 'done' | 'failed'

/** One labelled read-only status line. */
function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.statusRow}>
      <dt className={css.statusLabel}>{label}</dt>
      <dd className={css.statusValue}>{value}</dd>
    </div>
  )
}

/**
 * Render the System section: server status plus the restart control.
 * @param props - the locale seat and the injected connection face.
 * @returns the section element tree.
 */
export function MaintenanceSection({ t, useHostDescription, restart }: MaintenanceSectionProps) {
  const description = useHostDescription(value => value)
  const [phase, setPhase] = useState<RestartPhase>('idle')
  const [failure, setFailure] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  // A restart is only observable as a round trip, so the drop has to be seen
  // before the return counts: without this the first render after clicking —
  // still connected to the predecessor — would read as an immediate success.
  const droppedRef = useRef(false)

  const connected = description !== undefined

  useEffect(() => {
    if (phase !== 'restarting') return
    if (!connected) {
      droppedRef.current = true
      return
    }
    if (!droppedRef.current) return
    droppedRef.current = false
    setPhase('done')
  }, [phase, connected])

  const canRestart = description?.canRestart === true
  const restarting = phase === 'restarting'

  const openConfirmation = (): void => {
    setAcknowledged(false)
    setConfirming(true)
  }

  const confirmRestart = (): void => {
    setConfirming(false)
    setPhase('restarting')
    droppedRef.current = false
    restart().catch((error: unknown) => {
      droppedRef.current = false
      setFailure(error instanceof Error ? error.message : String(error))
      setPhase('failed')
    })
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('status')}</h3>
        {description === undefined
          ? <p className={css.muted}>{t('status.offline')}</p>
          : (
            <dl className={css.status}>
              <StatusRow label={t('status.version')} value={description.version} />
              <StatusRow label={t('status.cwd')} value={description.cwd} />
              <StatusRow
                label={t('status.sessions')}
                value={String(description.attachedSessions)}
              />
            </dl>
          )}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('restart.title')}</h3>
        <p className={css.cardBody}>{t('restart.description')}</p>
        {connected && !canRestart && <p className={css.muted}>{t('restart.unavailable')}</p>}
        <div className={css.actions}>
          <Button
            variant="outline"
            disabled={!canRestart || restarting}
            onClick={openConfirmation}
          >
            {t('restart.action')}
          </Button>
          {phase === 'restarting' && <span className={css.pending} role="status">{t('restart.pending')}</span>}
          {phase === 'done' && <span className={css.done} role="status">{t('restart.done')}</span>}
          {phase === 'failed' && (
            <span className={css.failed} role="alert">{t('restart.failed', { reason: failure })}</span>
          )}
        </div>
      </section>

      <RiskConfirmation
        open={confirming}
        title={t('restart.confirmTitle')}
        description={description === undefined || description.attachedSessions === 0
          ? t('restart.confirmIdle')
          : t('restart.confirmSessions', { count: String(description.attachedSessions) })}
        acknowledgeLabel={t('restart.acknowledge')}
        cancelLabel={t('restart.cancel')}
        confirmLabel={t('restart.confirm')}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        onCancel={() => { setConfirming(false) }}
        onConfirm={confirmRestart}
      />
    </div>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** System maintenance section copy. */
    'settings.maintenance': MaintenanceLocaleKey
  }
}
