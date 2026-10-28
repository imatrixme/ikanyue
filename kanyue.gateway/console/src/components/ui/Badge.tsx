import type { HTMLAttributes } from 'react'

import { cn } from './utils'

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
  green: 'bg-[var(--success-soft)] text-[var(--success)]',
  amber: 'bg-[var(--warning-soft)] text-[var(--warning-foreground)]',
  red: 'bg-[var(--danger-soft)] text-[var(--destructive)]',
  blue: 'bg-[var(--info-soft)] text-[var(--info)]',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('mr-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', toneClass[tone], className)} {...props} />
}

export function YesNo({ value }: { value: unknown }) {
  return value ? <Badge tone="green">是</Badge> : <Badge>否</Badge>
}
