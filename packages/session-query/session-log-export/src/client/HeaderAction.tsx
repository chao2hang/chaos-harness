import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/**
 * Render the Session export result dialog without displaying a persistent Header button.
 * (Export is triggered through the `/export` command or API).
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the Session-scoped dialog.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
