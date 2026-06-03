import type { HTMLAttributes } from 'react'

import { cn } from './utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-lg border border-[#d8dedb] bg-white shadow-sm', className)} {...props} />
}

export function SectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebe8] px-4 py-3', className)} {...props} />
}
