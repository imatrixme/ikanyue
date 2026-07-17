import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'

import { IconButton } from './Controls'
import { cn } from './utils'
import { useOverlayFocus } from './useOverlayFocus'

interface DrawerShellProps {
  children: ReactNode
  description?: string
  dismissible?: boolean
  onRequestClose: () => void
  size?: 'default' | 'wide'
  title: string
}

export function DrawerShell({ children, description, dismissible = true, onRequestClose, size = 'default', title }: DrawerShellProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useOverlayFocus(drawerRef, dismissible, onRequestClose)

  return (
    <div className="fixed inset-0 z-50 bg-[var(--overlay)]" onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onRequestClose() }} role="presentation">
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn('ml-auto flex h-full w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--card)] shadow-xl outline-none sm:max-w-[var(--ky-overlay-size-drawer)]', size === 'wide' && 'sm:max-w-[var(--ky-overlay-size-dialog-lg)]')}
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0"><h2 className="text-lg font-semibold" id={titleId}>{title}</h2>{description ? <p className="ky-paragraph mt-1" id={descriptionId}>{description}</p> : null}</div>
          {dismissible ? <IconButton icon={<X aria-hidden="true" className="h-4 w-4" />} label="关闭弹窗" onClick={onRequestClose} type="button" variant="ghost" /> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  )
}
