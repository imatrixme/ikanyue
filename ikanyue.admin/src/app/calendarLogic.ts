import type { CalendarLayoutEntry, CourseCalendarEntry, CourseCalendarView } from './calendarTypes'

const SHANGHAI_TIMEZONE = 'Asia/Shanghai'
const DAY_START_MINUTE = 8 * 60
const DAY_END_MINUTE = 21 * 60
const DAY_SPAN_MINUTES = DAY_END_MINUTE - DAY_START_MINUTE

export function normalizeCalendarView(value: string | null): CourseCalendarView {
  return value === 'day' || value === 'month' || value === 'list' ? value : 'week'
}

export function todayKey(now = new Date()): string {
  return dateKeyInShanghai(now.toISOString())
}

export function normalizeDateKey(value: string | null, fallback = todayKey()): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? String(value) : fallback
}

export function addDateDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function startOfWeek(dateKey: string): string {
  const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()
  return addDateDays(dateKey, -((day + 6) % 7))
}

export function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

export function monthGridDays(dateKey: string): string[] {
  const start = startOfWeek(startOfMonth(dateKey))
  return Array.from({ length: 42 }, (_, index) => addDateDays(start, index))
}

export function visibleCalendarDays(view: CourseCalendarView, dateKey: string): string[] {
  if (view === 'day') return [dateKey]
  if (view === 'week') {
    const start = startOfWeek(dateKey)
    return Array.from({ length: 7 }, (_, index) => addDateDays(start, index))
  }
  if (view === 'month') return monthGridDays(dateKey)
  return Array.from({ length: 42 }, (_, index) => addDateDays(dateKey, index))
}

export function calendarRange(view: CourseCalendarView, dateKey: string): { from: string; to: string } {
  const days = visibleCalendarDays(view, dateKey)
  return { from: shanghaiBoundary(days[0]), to: shanghaiBoundary(addDateDays(days.at(-1)!, 1)) }
}

export function shiftCalendarDate(view: CourseCalendarView, dateKey: string, direction: -1 | 1): string {
  if (view === 'day') return addDateDays(dateKey, direction)
  if (view === 'week') return addDateDays(dateKey, direction * 7)
  if (view === 'list') return addDateDays(dateKey, direction * 42)
  const date = new Date(`${startOfMonth(dateKey)}T12:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + direction)
  return date.toISOString().slice(0, 10)
}

export function dateKeyInShanghai(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function shanghaiLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export function shanghaiLocalInputToIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? new Date(`${value}:00+08:00`).toISOString()
    : ''
}

export function groupCalendarEntries(entries: CourseCalendarEntry[]): Map<string, CourseCalendarEntry[]> {
  const groups = new Map<string, CourseCalendarEntry[]>()
  for (const entry of entries) {
    const key = entry.startAt ? dateKeyInShanghai(entry.startAt) : ''
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }
  for (const items of groups.values()) items.sort(compareEntries)
  return groups
}

export function layoutDayEntries(entries: CourseCalendarEntry[], dayKey: string): CalendarLayoutEntry[] {
  const candidates = entries.map((entry) => ({ entry, ...entryMinutes(entry) }))
    .filter((item) => item.start < item.end).sort((left, right) => left.start - right.start)
  const result: CalendarLayoutEntry[] = []
  let group: typeof candidates = []
  let groupEnd = -1
  const flush = () => {
    if (!group.length) return
    const laneEnds: number[] = []
    const placed = group.map((item) => {
      const lane = laneEnds.findIndex((end) => end <= item.start)
      const targetLane = lane < 0 ? laneEnds.length : lane
      laneEnds[targetLane] = item.end
      return { ...item, lane: targetLane }
    })
    const laneCount = laneEnds.length
    result.push(...placed.map(({ entry, lane, start, end }) => ({
      ...entry,
      dayKey,
      lane,
      laneCount,
      topPercent: ((Math.max(start, DAY_START_MINUTE) - DAY_START_MINUTE) / DAY_SPAN_MINUTES) * 100,
      heightPercent: (Math.max(30, Math.min(end, DAY_END_MINUTE) - Math.max(start, DAY_START_MINUTE)) / DAY_SPAN_MINUTES) * 100,
    })))
    group = []
  }
  for (const candidate of candidates) {
    if (group.length && candidate.start >= groupEnd) flush()
    group.push(candidate)
    groupEnd = Math.max(groupEnd, candidate.end)
  }
  flush()
  return result
}

export function calendarStatusLabel(status: string): string {
  return ({
    draft: '草稿', scheduled: '待上课', enrollment_closed: '名单已锁定', in_progress: '上课中',
    completed: '已完成', settled: '已核销', cancelled: '已取消', correction_pending: '教务处理中',
  } as Record<string, string>)[status] || status
}

export function calendarOriginLabel(origin: string): string {
  return ({ class: '班级排课', appointment: '预约成课', admin: '教务排课' } as Record<string, string>)[origin] || origin
}

function shanghaiBoundary(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000+08:00`).toISOString()
}

function entryMinutes(entry: CourseCalendarEntry): { start: number; end: number } {
  return { start: shanghaiMinute(entry.startAt), end: shanghaiMinute(entry.endAt) }
}

function shanghaiMinute(value: string | null): number {
  if (!value) return -1
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHANGHAI_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return hour * 60 + minute
}

function compareEntries(left: CourseCalendarEntry, right: CourseCalendarEntry): number {
  return Date.parse(left.startAt!) - Date.parse(right.startAt!)
    || left.lessonId.localeCompare(right.lessonId)
}
