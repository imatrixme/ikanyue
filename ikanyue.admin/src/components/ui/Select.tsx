import type { SelectHTMLAttributes } from 'react'

import { cn } from './utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: string
}

export function Select({ options, placeholder = '请选择', allowEmpty = false, emptyLabel = '暂无可选数据', className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-10 min-w-0 w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <option value="" disabled={!allowEmpty}>{options.length > 0 ? placeholder : emptyLabel}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}
