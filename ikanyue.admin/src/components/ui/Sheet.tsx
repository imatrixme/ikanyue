import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

import { Button } from './Button'
import { cn } from './utils'

interface SheetProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  side?: 'center' | 'right'
  suspended?: boolean
}

export function Sheet({ open, title, description, onClose, children, footer, className, side = 'center', suspended = false }: SheetProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || suspended) {
      return undefined
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = getFocusableElements(dialog)
    const firstFocusable = focusable[0] || dialog
    firstFocusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) {
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
      previousFocusRef.current?.focus()
    }
  }, [open, suspended])

  if (!open) {
    return null
  }

  if (suspended) {
    return (
      <div aria-hidden="true" className="hidden">
        {children}
        {footer}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]" type="button" aria-label="关闭表单遮罩" onClick={onClose} />
      <section
        aria-label={title}
        aria-modal="true"
        className={cn(
          side === 'right'
            ? 'absolute inset-y-0 right-0 flex h-full w-[min(920px,calc(100vw-1rem))] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-2xl'
            : 'absolute left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-2xl',
          className,
        )}
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
            {description ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p> : null}
          </div>
          <Button
            aria-label="关闭"
            className="h-9 w-9 px-0"
            icon={<X className="h-4 w-4" aria-hidden="true" />}
            onClick={onClose}
            type="button"
            variant="ghost"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-[var(--border)] bg-[var(--muted)]/40 px-5 py-4">{footer}</footer> : null}
      </section>
    </div>
  )
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) {
    return []
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}
