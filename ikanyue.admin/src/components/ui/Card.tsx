import type { HTMLAttributes } from 'react'

import { cn } from './utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm', className)} {...props} />
}

export function SectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4', className)} {...props} />
}
