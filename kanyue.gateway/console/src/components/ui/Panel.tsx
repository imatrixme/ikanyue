import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--card-foreground)] shadow-sm', className)} {...props} />
}

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {intro ? <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-semibold">{children}</h2>
}
