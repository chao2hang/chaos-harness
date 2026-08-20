import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Render presentation outside the owner's stacking and overflow contexts.
 * @param props.children - in-page UI that should be attached to document.body.
 * @returns the portaled React node.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
