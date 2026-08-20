/** `layout` namespace dictionaries: frame chrome (drawer toggle copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'drawer.open': '打开侧边栏',
  'drawer.close': '收起侧边栏',
} satisfies Record<string, string>

/** The layout namespace key union. */
export type LayoutKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'drawer.open': 'Open sidebar',
  'drawer.close': 'Close sidebar',
} satisfies Record<LayoutKey, string>
