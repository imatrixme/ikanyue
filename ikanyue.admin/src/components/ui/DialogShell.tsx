import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { Button } from './Button'
import { cn } from './utils'

interface DialogShellProps {
  children: React.ReactNode
  description?: string
  dismissible?: boolean
  onRequestClose: () => void
  size?: 'compact' | 'medium' | 'wide'
  title: string
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const sizeClass = {
  compact: 'sm:max-w-lg',
  medium: 'sm:max-w-2xl',
  wide: 'sm:max-w-4xl',
}

export function DialogShell({ children, description, dismissible = true, onRequestClose, size = 'medium', title }: DialogShellProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const closeHandlerRef = useRef(onRequestClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    closeHandlerRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    const initial = dialog?.querySelector<HTMLElement>('[data-autofocus]')
      || dialog?.querySelector<HTMLElement>(focusableSelector)
      || dialog
    initial?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialogRef.current) return
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        closeHandlerRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      const opener = openerRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [dismissible])

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
            <Button aria-label="关闭弹窗" className="h-9 w-9 shrink-0 px-0" icon={<X className="h-4 w-4" />} onClick={onRequestClose} type="button" variant="ghost" />
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  )
}
