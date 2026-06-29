import type { HTMLAttributes } from 'react'

import { cn } from './utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm', className)} {...props} />
}
