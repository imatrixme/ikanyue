import type { HTMLAttributes } from 'react'

import { cn } from './utils'

type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-[#edf0ef] text-[#39434d] border-[#d8dedb]',
  green: 'bg-[#e3f3e8] text-[#1e5d3d] border-[#c4dec9]',
  amber: 'bg-[#fbefd8] text-[#77510f] border-[#ecd49f]',
  red: 'bg-[#f5e3df] text-[#843326] border-[#e6beb6]',
  blue: 'bg-[#dfeef2] text-[#174a5c] border-[#bdd9df]',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold', toneClass[tone], className)} {...props} />
}
