/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron),
 * each drilling into its own list — the provider-grouped model list over
 * the shared directory, and the effort levels. The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the caption tone.
 * Data and submission ride the SAME per-session ModelDirectory as the
 * /model popup; exact-model reasoning metadata and the selected effort come
 * from the Host rather than a client-owned vocabulary. A rejected selection
 * announces through the shared transient Toast anchored to the composer
 * card; the in-menu strip with Retry remains the catalog-load surface.
 */
import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type FocusEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'

/** Which pane the dropdown shows: the two-row root or one drilled-in list. */
type Pane = 'root' | 'model' | 'effort' | 'context' | 'output'
type CapabilitySelection = ModelSelection & {
  contextWindow?: number
  maxTokens?: number
  imageInput?: boolean
  enableReasoning?: true
}

/** Fixed escalation order shared by the settings declaration and composer control. */
const EFFORT_SCALE = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const CONTEXT_STEPS = [4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 1_000_000] as const
const OUTPUT_STEPS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000] as const

function capacityLabel(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${String(value / 1_000_000)}M`
  if (value >= 1_000 && value % 1_000 === 0) return `${String(value / 1_000)}K`
  return String(value)
}

function nearestStep(steps: readonly number[], value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  return steps.reduce((closest, candidate, index) =>
    Math.abs(candidate - value) < Math.abs((steps[closest] ?? value) - value) ? index : closest, 0)
}

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortById = useMemo(() => new Map(reasoning?.efforts.map(effort => [effort.id, effort]) ?? []), [reasoning])
  const effortIndex = effectiveEffort === undefined ? -1 : EFFORT_SCALE.indexOf(effectiveEffort as typeof EFFORT_SCALE[number])
  const [draftEffortIndex, setDraftEffortIndex] = useState(Math.max(effortIndex, 0))
  const declaredContextWindow = currentChoice?.model.contextWindow
  const declaredMaxTokens = currentChoice?.model.maxTokens
  const [contextWindow, setContextWindow] = useState<number | undefined>(declaredContextWindow)
  const [maxTokens, setMaxTokens] = useState<number | undefined>(declaredMaxTokens)
  const capabilitiesEditable = currentChoice?.model.capabilitiesEditable === true
  const imageInput = currentChoice?.model.inputModalities?.includes('image') === true
  const busy = state.status === 'selecting'

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  // Mount-time load resolves the trigger label; every open refreshes.
  useEffect(() => {
    if (available) {
      lastActionRef.current = 'load'
      load()
    }
  }, [available, load])

  useEffect(() => {
    setDraftEffortIndex(Math.max(effortIndex, 0))
  }, [effortIndex])

  useEffect(() => {
    setContextWindow(declaredContextWindow)
    setMaxTokens(declaredMaxTokens)
  }, [declaredContextWindow, declaredMaxTokens])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  if (!available) return null

  const show = (): void => {
    setPane('root')
    setOpen(true)
    reload()
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      // Escape backs out of a drilled pane first, then closes.
      if (pane !== 'root') setPane('root')
      else close(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  const settleSelection = (accepted: boolean, keepOpen = false): void => {
    if (accepted) {
      if (!keepOpen && rootRef.current !== null) close(true)
      return
    }
    const message = directory.getSnapshot().error
    if (message !== null) {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('error.action', { message }) })
    }
  }

  const choose = (
    selection: ModelSelection,
    adjustment?: { requested: string; selected: string },
  ): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    lastActionRef.current = 'select'
    void select(selection).then((accepted) => {
      settleSelection(accepted)
      if (!accepted || adjustment === undefined) return
      toastSeq.current += 1
      setToast({
        seq: toastSeq.current,
        text: t('notice.effortAdjusted', adjustment),
      })
    })
  }

  const chooseModel = (provider: string, model: (typeof choices)[number]['model']): void => {
    const currentReasoning = currentChoice?.model.reasoning
    const requested = effectiveEffort
    if (requested === undefined) {
      choose({
        provider,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      })
      return
    }
    if (model.reasoning === undefined) {
      choose({ provider, model: model.id }, {
        requested: currentReasoning?.efforts.find(effort => effort.id === requested)?.name ?? requested,
        selected: t('effort.providerDefault'),
      })
      return
    }
    const exact = model.reasoning.efforts.find(effort => effort.id === requested)
    if (exact !== undefined) {
      choose({ provider, model: model.id, reasoningEffort: exact.id })
      return
    }
    const currentOrder = currentReasoning?.efforts.map(effort => effort.id) ?? []
    const requestedAt = currentOrder.indexOf(requested)
    const lower = requestedAt < 0
      ? undefined
      : [...model.reasoning.efforts].reverse().find((effort) => {
        const at = currentOrder.indexOf(effort.id)
        return at >= 0 && at < requestedAt
      })
    const selected = lower?.id ?? model.reasoning.defaultEffort
    choose({
      provider,
      model: model.id,
      ...selected === undefined ? {} : { reasoningEffort: selected },
    }, {
      requested: currentReasoning?.efforts.find(effort => effort.id === requested)?.name ?? requested,
      selected: model.reasoning.efforts.find(effort => effort.id === selected)?.name
        ?? (selected === undefined ? t('effort.providerDefault') : selected),
    })
  }

  const supportedEffortAt = (requested: number): string | undefined => {
    const supported = EFFORT_SCALE
      .map((effort, index) => ({ effort, index }))
      .filter(candidate => effortById.has(candidate.effort))
    return (supported.find(candidate => candidate.index === requested)
      ?? supported.findLast(candidate => candidate.index < requested)
      ?? supported.find(candidate => candidate.index > requested))?.effort
  }

  const commitEffort = (): void => {
    if (state.current === null) return
    const effort = supportedEffortAt(draftEffortIndex)
    if (effort === undefined || effectiveEffort === effort) return
    lastActionRef.current = 'select'
    void select({
      provider: state.current.provider,
      model: state.current.model,
      reasoningEffort: effort,
    }).then((accepted) => {
      if (!accepted) setDraftEffortIndex(Math.max(effortIndex, 0))
      settleSelection(accepted, true)
    })
  }

  const persistCapability = (change: Pick<CapabilitySelection, 'imageInput' | 'enableReasoning'>): void => {
    if (state.current === null || !capabilitiesEditable) return
    lastActionRef.current = 'select'
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...effectiveEffort === undefined ? {} : { reasoningEffort: effectiveEffort },
      ...change,
    }).then((accepted) => { settleSelection(accepted, true) })
  }

  const previewCapacity = (field: 'contextWindow' | 'maxTokens', value: number): void => {
    if (field === 'contextWindow') setContextWindow(value)
    else setMaxTokens(value)
  }

  const commitCapacity = (field: 'contextWindow' | 'maxTokens'): void => {
    if (state.current === null || !capabilitiesEditable) return
    const value = field === 'contextWindow' ? contextWindow : maxTokens
    const declared = field === 'contextWindow' ? declaredContextWindow : declaredMaxTokens
    if (value === undefined || value === declared) return
    lastActionRef.current = 'select'
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...effectiveEffort === undefined ? {} : { reasoningEffort: effectiveEffort },
      [field]: value,
    }).then((accepted) => {
      if (!accepted) {
        setContextWindow(declaredContextWindow)
        setMaxTokens(declaredMaxTokens)
      }
      settleSelection(accepted, true)
    })
  }

  const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = currentChoice === undefined
    ? t('trigger.selectAria')
    : effortLabel === undefined
      ? t('trigger.aria', { model: modelLabel })
      : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  itemRefs.current = []
  let itemIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onRootKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) {
            close()
          } else {
            show()
          }
        }}
      >
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open && (
        <>
          <div className={css.mobileScrim} aria-hidden="true" onClick={() => { close() }} />
          <div
            id={`${id}-menu`}
            className={css.menu}
            role="menu"
            aria-label={t('menu.aria')}
            aria-busy={state.status === 'loading' || busy}
          >
            {pane === 'root' && (
              <>
                <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { setPane('model') }}>
                  <span className={css.cellLabel}>{t('menu.model')}</span>
                  <span className={css.cellValue}>{modelLabel}</span>
                  <IconChevronRightOutline14 className={css.cellChevron} />
                </button>
                {reasoning !== undefined
                  ? (
                    <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { setPane('effort') }}>
                      <span className={css.cellLabel}>{t('menu.effort')}</span>
                      <span className={css.cellValue}>{effortLabel}</span>
                      <IconChevronRightOutline14 className={css.cellChevron} />
                    </button>
                  )
                  : capabilitiesEditable && (
                    <button ref={itemRef()} type="button" role="menuitem" className={css.cell} disabled={busy} onClick={() => { persistCapability({ enableReasoning: true }) }}>
                      <span className={css.cellLabel}>{t('menu.effort')}</span>
                      <span className={css.cellValue}>{t('action.enable')}</span>
                    </button>
                  )}
                {capabilitiesEditable && (
                  <label className={css.toggleRow}>
                    <span>{t('menu.imageInput')}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={imageInput}
                      disabled={busy}
                      aria-label={t('menu.imageInput')}
                      onChange={(event) => { persistCapability({ imageInput: event.target.checked }) }}
                    />
                  </label>
                )}
                {contextWindow !== undefined && (
                  <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { setPane('context') }}>
                    <span className={css.cellLabel}>{t('menu.contextWindow')}</span>
                    <span className={css.cellValue}>{capacityLabel(contextWindow)}</span>
                    <IconChevronRightOutline14 className={css.cellChevron} />
                  </button>
                )}
                {maxTokens !== undefined && (
                  <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { setPane('output') }}>
                    <span className={css.cellLabel}>{t('menu.maxTokens')}</span>
                    <span className={css.cellValue}>{capacityLabel(maxTokens)}</span>
                    <IconChevronRightOutline14 className={css.cellChevron} />
                  </button>
                )}
              </>
            )}

            {pane === 'model' && (
              <>
                {state.status === 'loading' && (
                  <div className={css.status}>{t('status.loading')}</div>
                )}
                {state.error !== null && lastActionRef.current === 'load' && (
                  <div className={css.error}>
                    <span>{t('error.action', { message: state.error })}</span>
                    <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                  </div>
                )}
                {state.failures.map(failure => (
                  <div className={css.warning} key={failure.id}>
                    <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
                    <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                  </div>
                ))}
                <div className={clsx(css.groups, 'scrollable')}>
                  {state.groups.map((group) => {
                    const headingId = `${id}-${group.id}`
                    return (
                      <section role="group" aria-labelledby={headingId} className={css.group} key={group.id}>
                        <div className={css.groupTitle} id={headingId}>{group.name}</div>
                        {group.models.map((model) => {
                          const selected = state.current?.provider === group.id && state.current.model === model.id
                          return (
                            <button
                              ref={itemRef()}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              className={clsx(css.option, selected && css.selected)}
                              key={model.id}
                              title={model.name}
                              disabled={busy}
                              onClick={() => { chooseModel(group.id, model) }}
                            >
                              <span className={css.optionCopy}>
                                <span className={css.modelName}>{model.name}</span>
                                {model.description !== undefined && (
                                  <span className={css.description}>{model.description}</span>
                                )}
                              </span>
                              <span className={css.check}>
                                {selected ? <IconCheckOutline16 /> : null}
                              </span>
                            </button>
                          )
                        })}
                      </section>
                    )
                  })}
                </div>
                {state.status === 'ready' && choices.length === 0 && (
                  <div className={css.empty}>{t('empty.models')}</div>
                )}
              </>
            )}

            {pane === 'effort' && (
              reasoning === undefined
                ? <div className={css.empty}>{t('empty.efforts')}</div>
                : (
                  <div className={css.effortScale}>
                    <div className={css.effortValue}>
                      {effortById.get(supportedEffortAt(draftEffortIndex) ?? '')?.name
                      ?? supportedEffortAt(draftEffortIndex)?.toUpperCase()
                      ?? effortLabel}
                    </div>
                    <input
                      className={css.effortRange}
                      type="range"
                      min={0}
                      max={EFFORT_SCALE.length - 1}
                      step={1}
                      value={draftEffortIndex}
                      aria-label={t('menu.effort')}
                      aria-valuetext={effortById.get(supportedEffortAt(draftEffortIndex) ?? '')?.name ?? effortLabel}
                      onChange={(event) => { setDraftEffortIndex(Number(event.target.value)) }}
                      onPointerUp={commitEffort}
                      onKeyUp={commitEffort}
                    />
                    <div className={css.effortTicks} aria-hidden>
                      {EFFORT_SCALE.map((effort) => {
                        const metadata = effortById.get(effort)
                        return (
                          <span key={effort} className={clsx(css.effortTick, metadata === undefined && css.effortTickDisabled)}>
                            {metadata?.name ?? effort.toUpperCase()}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
            )}

            {(pane === 'context' || pane === 'output') && (() => {
              const field = pane === 'context' ? 'contextWindow' : 'maxTokens'
              const steps = pane === 'context' ? CONTEXT_STEPS : OUTPUT_STEPS
              const value = pane === 'context' ? contextWindow : maxTokens
              const label = pane === 'context' ? t('menu.contextWindow') : t('menu.maxTokens')
              if (value === undefined) return <div className={css.empty}>{t('empty.capacity')}</div>
              return (
                <div className={css.capacityPanel}>
                  <div className={css.capacityReadout}>
                    <span>{label}</span>
                    <strong>{capacityLabel(value)}</strong>
                  </div>
                  <input
                    className={css.effortRange}
                    type="range"
                    min={0}
                    max={steps.length - 1}
                    step={1}
                    value={nearestStep(steps, value, pane === 'context' ? 6 : 5)}
                    aria-label={label}
                    aria-valuetext={capacityLabel(value)}
                    disabled={!capabilitiesEditable}
                    onChange={(event) => {
                      const selected = steps[Number(event.target.value)]
                      if (selected !== undefined) previewCapacity(field, selected)
                    }}
                    onPointerUp={() => { commitCapacity(field) }}
                    onKeyUp={() => { commitCapacity(field) }}
                  />
                  <div className={css.capacityEnds} aria-hidden>
                    <span>{capacityLabel(steps[0])}</span>
                    <span>{capacityLabel(steps.at(-1) ?? 0)}</span>
                  </div>
                  <div className={css.capacityNote}>
                    {capabilitiesEditable ? t('capacity.savedGlobally') : t('capacity.readOnly')}
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
