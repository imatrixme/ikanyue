import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from './Input'
import type { SelectOption } from './Select'
import { cn } from './utils'

interface ComboboxProps {
  id?: string
  'aria-label'?: string
  value: string
  options: SelectOption[]
  placeholder?: string
  emptyLabel?: string
  onValueChange: (value: string) => void
}

export function Combobox({ id, value, options, placeholder = '搜索并选择', emptyLabel = '暂无可选项', onValueChange, 'aria-label': ariaLabel }: ComboboxProps) {
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword
      ? options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(keyword)).slice(0, 8)
      : options.slice(0, 8)
  }, [options, query])

  return (
    <div className="rounded-md border border-[var(--input)] bg-[var(--card)] p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        <Input
          aria-label={ariaLabel}
          className="h-8 border-0 px-0 focus:ring-0"
          id={id}
          placeholder={selected?.label || (options.length > 0 ? placeholder : emptyLabel)}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto rounded-md bg-[var(--muted)]/35 p-1">
        {filtered.map((option) => (
          <button
            key={option.value}
            className={cn(
              'rounded px-2 py-1.5 text-left text-sm transition-colors',
              value === option.value ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--foreground)] hover:bg-[var(--card)]',
            )}
            onClick={() => {
              onValueChange(option.value)
              setQuery('')
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
        {filtered.length === 0 ? <div className="px-2 py-2 text-sm text-[var(--muted-foreground)]">{options.length > 0 ? '没有找到匹配结果' : emptyLabel}</div> : null}
      </div>
      {selected ? <div className="mt-2 text-xs text-[var(--muted-foreground)]">当前选择：{selected.label}</div> : null}
      {!selected && value ? <div className="mt-2 text-xs text-[var(--warning-foreground)]">当前值没有在已加载选项中找到：{value}</div> : null}
    </div>
  )
}
