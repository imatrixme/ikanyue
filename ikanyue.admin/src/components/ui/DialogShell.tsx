import { X } from 'lucide-react'
import { useId, useRef } from 'react'

import { IconButton } from './Controls'
import { cn } from './utils'
import { useOverlayFocus } from './useOverlayFocus'

interface DialogShellProps {
  children: React.ReactNode
  description?: string
  dismissible?: boolean
  onRequestClose: () => void
  size?: 'compact' | 'medium' | 'wide'
  title: string
}

const sizeClass = {
  compact: 'sm:max-w-lg',
  medium: 'sm:max-w-2xl',
  wide: 'sm:max-w-4xl',
}

export function DialogShell({ children, description, dismissible = true, onRequestClose, size = 'medium', title }: DialogShellProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useOverlayFocus(dialogRef, dismissible, onRequestClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onRequestClose()
      }}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          'flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--card)] shadow-xl outline-none sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-lg sm:border sm:border-[var(--border)]',
          sizeClass[size],
        )}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold" id={titleId}>{title}</h2>
            {description ? <p className="ky-paragraph mt-1" id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? (
            <IconButton icon={<X className="h-4 w-4" />} label="关闭弹窗" onClick={onRequestClose} type="button" variant="ghost" />
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  )
}
