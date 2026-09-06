import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { ReferenceOption } from '../../app/coursePresentation'
import { cn } from './utils'

interface ReferenceSelectProps {
  id?: string
  value: string
  options: ReferenceOption[]
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
  allowEmpty?: boolean
  className?: string
  'aria-label'?: string
}

export function ReferenceSelect({
  id,
  value,
  options,
  onChange,
  placeholder = '搜索并选择',
  emptyLabel = '暂无可选数据',
  loading = false,
  loadingLabel = '正在加载可选数据...',
  disabled = false,
  allowEmpty = false,
  className,
  'aria-label': ariaLabel,
}: ReferenceSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    if (!needle) return options
    return options.filter((option) => `${option.label} ${option.description || ''} ${option.keywords || ''}`.toLocaleLowerCase('zh-CN').includes(needle))
  }, [options, query])

  function choose(option: ReferenceOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault()
      choose(filtered[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div
      className={cn('relative min-w-0', className)}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          setQuery('')
        }
      }}
      ref={root}
    >
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <input
          aria-autocomplete="list"
          aria-controls={open ? `${id || 'reference'}-options` : undefined}
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          className="h-10 w-full rounded-md border border-[var(--input)] bg-[var(--card)] pl-9 pr-16 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          id={id}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0) }}
          onClick={() => setOpen(true)}
          onFocus={() => { setOpen(true); setQuery('') }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? loadingLabel : placeholder}
          role="combobox"
          value={open ? query : selected?.label || ''}
        />
        {allowEmpty && value ? (
          <button aria-label="清除选择" className="absolute right-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => onChange('')} type="button">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
      </div>
      {open && !disabled ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg" id={`${id || 'reference'}-options`} role="listbox">
          {loading ? <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">{loadingLabel}</p> : null}
          {!loading && filtered.length === 0 ? <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">{emptyLabel}</p> : null}
          {!loading ? filtered.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={cn('flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left hover:bg-[var(--brand-wash)] focus-visible:bg-[var(--brand-wash)] focus-visible:outline-none', index === activeIndex && 'bg-[var(--muted)]')}
              key={option.value}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{option.label}</strong>{option.description ? <span className="block truncate text-xs text-[var(--muted-foreground)]">{option.description}</span> : null}</span>
              {option.value === value ? <Check aria-hidden="true" className="h-4 w-4 text-[var(--brand)]" /> : null}
            </button>
          )) : null}
        </div>
      ) : null}
    </div>
  )
}
