import { format, isValid, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon, Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'

import { Button } from './Button'
import { Input } from './Input'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

interface DateTimePickerProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
}

export function DateTimePicker({ id, label, value, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = useMemo(() => parseValue(value), [value])
  const timeValue = parsed ? format(parsed, 'HH:mm') : ''
  const display = parsed ? format(parsed, 'yyyy-MM-dd HH:mm') : '选择日期和时间'

  function setDate(date?: Date) {
    if (!date) {
      return
    }
    const next = mergeDateTime(date, timeValue || '09:00')
    onChange(toLocalInputValue(next))
  }

  function setTime(time: string) {
    const date = parsed || new Date()
    onChange(toLocalInputValue(mergeDateTime(date, time)))
  }

  return (
    <div className="grid gap-2 rounded-md border border-[var(--input)] bg-[var(--card)] p-2 shadow-sm">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={label}
            className="h-10 justify-start px-3 text-left font-medium"
            icon={<CalendarIcon className="h-4 w-4" aria-hidden="true" />}
            type="button"
            variant="secondary"
          >
            {display}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <DayPicker
            mode="single"
            selected={parsed || undefined}
            onSelect={(date) => {
              setDate(date)
              if (date) {
                setOpen(false)
              }
            }}
            locale={zhCN}
            weekStartsOn={1}
            classNames={{
              caption_label: 'text-sm font-semibold',
              day: 'h-8 w-8 rounded text-sm hover:bg-[var(--secondary)]',
              selected: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]',
              today: 'border border-[var(--ring)]',
              chevron: 'h-4 w-4 fill-[var(--foreground)]',
            }}
          />
        </PopoverContent>
      </Popover>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        <Input
          id={id}
          aria-label={`${label}时间`}
          className="h-9"
          type="time"
          value={timeValue}
          onChange={(event) => setTime(event.target.value)}
        />
      </div>
    </div>
  )
}

function parseValue(value: string) {
  if (!value) {
    return null
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = normalized.endsWith('Z') ? parseISO(normalized) : new Date(normalized)
  return isValid(date) ? date : null
}

function mergeDateTime(date: Date, time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  const next = new Date(date)
  next.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0)
  return next
}

function toLocalInputValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}
