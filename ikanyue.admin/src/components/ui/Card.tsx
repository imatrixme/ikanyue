import type { HTMLAttributes } from 'react'

import { cn } from './utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm shadow-[var(--brand)]/8', className)} {...props} />
}

export function SectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-r from-[var(--brand-soft)]/45 to-transparent px-5 py-4', className)} {...props} />
}
