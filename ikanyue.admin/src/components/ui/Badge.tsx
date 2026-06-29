import type { HTMLAttributes } from 'react'

import { cn } from './utils'

type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]',
  green: 'border-transparent bg-[var(--success-soft)] text-[var(--success)]',
  amber: 'border-transparent bg-[var(--warning-soft)] text-[var(--warning-foreground)]',
  red: 'border-transparent bg-[var(--danger-soft)] text-[var(--destructive)]',
  blue: 'border-transparent bg-[var(--info-soft)] text-[var(--info)]',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', toneClass[tone], className)} {...props} />
}
