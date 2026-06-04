import { X } from 'lucide-react'
import type { ReactNode } from 'react'

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
}

export function Sheet({ open, title, description, onClose, children, footer, className }: SheetProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]" type="button" aria-label="关闭表单遮罩" onClick={onClose} />
      <section
        aria-label={title}
        aria-modal="true"
        className={cn(
          'absolute left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-2xl',
          className,
        )}
        role="dialog"
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
