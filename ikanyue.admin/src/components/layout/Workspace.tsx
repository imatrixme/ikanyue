import type { HTMLAttributes, ReactNode } from 'react'

import { Panel } from '../ui/Card'
import { cn } from '../ui/utils'

export function WorkspacePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Panel className={cn('min-w-0 overflow-hidden', className)} {...props} />
}

export function PageHeader({ actions, title }: { actions?: ReactNode; title: string }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5 sm:px-5">
      <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function SectionHeader({ actions, description, title }: { actions?: ReactNode; description?: string; title: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p> : null}</div>{actions}</div>
}

export function SummaryBand({ children }: { children: ReactNode }) {
  return <section className="grid gap-px border-b border-[var(--border)] bg-[var(--border)] sm:grid-flow-col sm:auto-cols-fr">{children}</section>
}

export function SummaryMetric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="bg-[var(--card)] px-5 py-4"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>
}

export function FilterToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('grid gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5', className)} aria-label="筛选工具栏">{children}</section>
}

export function WorkspaceBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}>{children}</div>
}
