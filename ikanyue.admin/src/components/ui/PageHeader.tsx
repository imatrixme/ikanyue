import type { ReactNode } from 'react'

import { cn } from './utils'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm">{icon}</span> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-medium text-[var(--muted-foreground)]">{eyebrow}</p> : null}
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
          {description ? <p className="text-sm text-[var(--muted-foreground)]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
