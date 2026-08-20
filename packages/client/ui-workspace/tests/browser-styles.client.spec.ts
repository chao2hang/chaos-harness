/**
 * WorkspaceBrowser spacing contract, asserted against the CSS text on disk:
 * row fills share the shell's trailing inset, the stable scrollbar counts
 * inside it, and flat, grouped, and search views keep their intended rhythm.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/WorkspaceBrowser.module.css', import.meta.url)), 'utf8')
const rowsCss = readFileSync(fileURLToPath(new URL('../src/client/rows/Rows.module.css', import.meta.url)), 'utf8')

/**
 * Split a stylesheet into the rules written at top level and the body of each
 * at-rule block, keyed by prelude. Without the split a conditional override
 * merges into its own base rule and the base value becomes unassertable.
 * @param source - stylesheet text.
 * @returns top-level text plus each at-rule body by prelude.
 */
function segmentsOf(source: string): { top: string; atRules: Map<string, string> } {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const atRules = new Map<string, string>()
  let top = ''
  let cursor = 0
  while (cursor < withoutComments.length) {
    const at = withoutComments.indexOf('@', cursor)
    if (at === -1) { top += withoutComments.slice(cursor); break }
    top += withoutComments.slice(cursor, at)
    const open = withoutComments.indexOf('{', at)
    if (open === -1) { top += withoutComments.slice(at); break }
    let depth = 0
    let end = open
    for (; end < withoutComments.length; end += 1) {
      if (withoutComments[end] === '{') depth += 1
      else if (withoutComments[end] === '}' && (depth -= 1) === 0) break
    }
    atRules.set(withoutComments.slice(at, open).trim(), withoutComments.slice(open + 1, end))
    cursor = end + 1
  }
  return { top, atRules }
}

/**
 * Declarations of one selector rule, keyed by property with whitespace collapsed.
 * Declaration order and trailing semicolons are normalized away.
 * @param source - stylesheet text.
 * @param selector - one exact selector, including a leading dot for local classes.
 * @param atRule - at-rule prelude to read inside; omit for the top-level rules.
 * @returns the rule's declarations, or undefined when no such rule exists.
 */
function declarationsFrom(source: string, selector: string, atRule?: string): Map<string, string> | undefined {
  const { top, atRules } = segmentsOf(source)
  const scope = atRule === undefined ? top : atRules.get(atRule) ?? ''
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

/** Phone breakpoint the touch-sizing overrides are written under. */
const TOUCH = '@media (max-width: 640px)'

const declarations = (selector: string, atRule?: string): Map<string, string> | undefined =>
  declarationsFrom(css, selector, atRule)
const rowDeclarations = (selector: string, atRule?: string): Map<string, string> | undefined =>
  declarationsFrom(rowsCss, selector, atRule)

describe('WorkspaceBrowser.module.css list', () => {
  const root = declarations('.root')
  const listArea = declarations('.listArea')
  const list = declarations('.list')

  it('is the scrolling region', () => {
    expect(list).toBeDefined()
    expect(list!.get('overflow-y')).toBe('auto')
  })

  it('counts the themed scrollbar inside the shell trailing inset', () => {
    expect(root?.get('--dsh-session-list-edge-inset')).toBe('var(--dsh-sidebar-inline-padding)')
    expect(root?.get('--dsh-session-list-scrollbar-width')).toBe('8px')
    expect(root?.get('--dsh-session-list-scrollbar-offset')).toBe('2px')
    expect(root?.get('padding-right')).toBe('var(--dsh-session-list-edge-inset)')
    expect(listArea?.get('margin-left')).toBe('-4px')
    expect(listArea?.get('padding-left')).toBe('4px')
    expect(listArea?.get('margin-right')).toBe('calc(-1 * var(--dsh-session-list-edge-inset))')
    expect(declarations('.fade')?.get('right')).toBe('var(--dsh-session-list-edge-inset)')
    expect(list?.get('margin-right')).toBe('var(--dsh-session-list-scrollbar-offset)')
    expect(list?.get('margin-left')).toBe('-4px')
    expect(list?.get('padding-left')).toBe('4px')
    expect(list?.get('padding-right')).toBe([
      'calc(',
      'var(--dsh-session-list-edge-inset)',
      '- var(--dsh-session-list-scrollbar-width)',
      '- var(--dsh-session-list-scrollbar-offset)',
      ')',
    ].join(' '))
    expect(declarations('.list::-webkit-scrollbar')).toBeUndefined()
  })

  it('reserves the scrollbar whether or not the list overflows', () => {
    expect(list!.get('scrollbar-gutter')).toBe('stable')
  })

  it('keeps 2px between rows and 4px between workspace groups', () => {
    expect(declarations('.flatList > * + *')?.get('margin-top')).toBe('2px')
    expect(declarations(".searchTree > [role='treeitem'] + [role='treeitem']")?.get('margin-top')).toBe('2px')
    expect(declarations('.groupSection > * + *')?.get('margin-top')).toBe('2px')
    expect(declarations('.groupSection + .groupSection')?.get('margin-top')).toBe('4px')
  })

  it('draws drag targets as a leading chevron joined to the insertion line', () => {
    const listTopMarker = declarations('.listTopDropIndicator')
    const workspaceMarker = declarations('.workspaceDropBefore::before')
    const sessionMarker = rowDeclarations('.sessionRow.dropBefore::before')
    expect(listTopMarker?.get('top')).toBe('-8px')
    expect(listTopMarker?.get('left')).toBe('0')
    expect(workspaceMarker?.get('left')).toBe('0')
    expect(sessionMarker?.get('left')).toBe('0')
    for (const marker of [listTopMarker, workspaceMarker, sessionMarker]) {
      expect(marker?.get('height')).toBe('12px')
      expect(marker?.get('background')).not.toContain('radial-gradient')
      expect(marker?.get('background')).toContain('55deg')
      expect(marker?.get('background')).toContain('125deg')
      expect(marker?.get('background')).toContain('calc(50% - 1px) calc(50% + 1px)')
      expect(marker?.get('background')).toContain('0 0 / 5px 7px')
      expect(marker?.get('background')).toContain('0 5px / 5px 7px')
      expect(marker?.get('background')).toContain('4px 5px / calc(100% - 4px) 2px')
    }
  })

  it('keeps the compact fade, overflow control, search field, and row heights', () => {
    expect(declarations('.fade')?.get('height')).toBe('24px')
    expect(declarations('.sessionOverflowButton')?.get('height')).toBe('28px')
    expect(declarations('.searchExpanded')?.get('height')).toBe('30px')
    expect(rowDeclarations('.projectRow')?.get('height')).toBe('34px')
    expect(rowDeclarations('.sessionRow')?.get('height')).toBe('32px')
    expect(rowDeclarations('.flatSessionRowWithoutStatus .title')?.get('margin-left')).toBe('0')
    expect(rowDeclarations('.searchResultRow')?.get('min-height')).toBe('48px')
    expect(rowDeclarations('.sessionRow.selected')?.get('background'))
      .toBe('var(--dsw-alias-interactive-bg-hover)')
  })

  it('pins both rail controls to the shared left anchor during the column slide', () => {
    expect(declarations('.rail .sectionHeader')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.rail .iconButton')?.get('width')).toBe('36px')
    expect(declarations('.rail .search')?.get('width')).toBe('36px')
  })

  it('gives the phone drawer touch-sized rows and header controls', () => {
    expect(rowDeclarations('.projectRow', TOUCH)?.get('height')).toBe('44px')
    expect(rowDeclarations('.sessionRow', TOUCH)?.get('height')).toBe('44px')
    expect(rowDeclarations('.iconButton', TOUCH)?.get('height')).toBe('32px')
    expect(declarations('.iconButton', TOUCH)?.get('height')).toBe('40px')
    // The collapsed search wrapper clips its button, so it grows with it.
    expect(declarations('.search', TOUCH)?.get('height')).toBe('40px')
    expect(declarations('.sectionHeader', TOUCH)?.get('height')).toBe('44px')
  })

  it('keeps the hover-only row verbs reachable without a hovering pointer', () => {
    const noHover = '@media (hover: none)'
    expect(rowDeclarations('.sessionRow .rowActions', noHover)?.get('display')).toBe('inline-flex')
    expect(rowDeclarations('.sessionRow .time', noHover)?.get('display')).toBe('none')
  })
})
