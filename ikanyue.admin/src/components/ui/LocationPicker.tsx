import { MapPin, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ResourceLookup } from '../../app/types'
import { Input } from './Input'

interface LocationPickerProps {
  id?: string
  label: string
  value: string
  resources?: ResourceLookup
  placeholder?: string
  onValueChange: (value: string) => void
}

export function LocationPicker({ id, label, value, resources = {}, placeholder = '输入或搜索地点', onValueChange }: LocationPickerProps) {
  const [focused, setFocused] = useState(false)
  const suggestions = useMemo(() => {
    const values = new Set<string>()
    resources.activities?.items.forEach((record) => {
      if (record.location) {
        values.add(String(record.location))
      }
    })
    resources.learningSessions?.items.forEach((record) => {
      const metadata = record.metadata
      if (metadata && typeof metadata === 'object' && 'location' in metadata) {
        values.add(String(metadata.location))
      }
    })
    return [...values]
  }, [resources])
  const filtered = suggestions.filter((item) => !value || item.includes(value)).slice(0, 6)

  return (
    <div className="relative">
      <div className="flex h-10 items-center gap-2 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 shadow-sm focus-within:border-[var(--ring)] focus-within:ring-2 focus-within:ring-[var(--ring)]/15">
        <MapPin className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        <Input
          aria-label={label}
          className="h-8 w-full border-0 px-0 shadow-none focus-visible:ring-0"
          id={id}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => onValueChange(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          value={value}
        />
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
      </div>
      {focused && filtered.length > 0 ? (
        <div className="absolute z-20 mt-1 grid w-full gap-1 rounded-md border border-[var(--border)] bg-[var(--popover)] p-1 shadow-xl">
          {filtered.map((item) => (
            <button className="rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)]" key={item} onMouseDown={(event) => event.preventDefault()} onClick={() => onValueChange(item)} type="button">
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
