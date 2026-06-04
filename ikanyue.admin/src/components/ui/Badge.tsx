import type { HTMLAttributes } from 'react'

import { cn } from './utils'

type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)]',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  blue: 'border-cyan-200 bg-cyan-50 text-cyan-700',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shadow-sm', toneClass[tone], className)} {...props} />
}
