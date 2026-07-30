import type { CourseCalendarEntry, CourseCalendarView } from '../../app/calendarTypes'
import { calendarOriginLabel, calendarStatusLabel, groupCalendarEntries, layoutDayEntries } from '../../app/calendarLogic'
import { Badge } from '../ui/Badge'
import { DataTable } from '../ui/DataDisplay'
import { cn } from '../ui/utils'

interface Props {
  dateKey: string
  days: string[]
  entries: CourseCalendarEntry[]
  onOpen: (entry: CourseCalendarEntry) => void
  view: CourseCalendarView
}

export function CourseCalendarViews(props: Props) {
  const groups = groupCalendarEntries(props.entries)
  if (props.view === 'month') return <MonthView {...props} groups={groups} />
  if (props.view === 'list') return <AgendaList entries={props.entries} groups={groups} onOpen={props.onOpen} />
  return <><div className="hidden md:block"><TimeGrid {...props} groups={groups} /></div><div className="md:hidden"><AgendaList entries={props.entries} groups={groups} onOpen={props.onOpen} /></div></>
}

function TimeGrid({ days, groups, onOpen }: Props & { groups: Map<string, CourseCalendarEntry[]> }) {
  const columns = `4rem repeat(${days.length}, minmax(8rem, 1fr))`
  return (
    <div className="overflow-x-auto" data-testid="calendar-time-grid">
      <div className="min-w-[760px]" style={{ display: 'grid', gridTemplateColumns: columns }}>
        <div className="border-b border-[var(--border)] bg-[var(--muted)]" />
        {days.map((day) => <DayHeader day={day} key={day} />)}
        <TimeLabels />
        {days.map((day) => <DayColumn day={day} entries={groups.get(day) || []} key={day} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function DayHeader({ day }: { day: string }) {
  const date = new Date(`${day}T12:00:00.000Z`)
  return <div className="border-b border-l border-[var(--border)] bg-[var(--muted)] px-3 py-3 text-center"><p className="text-xs text-[var(--muted-foreground)]">{date.toLocaleDateString('zh-CN', { weekday: 'short', timeZone: 'UTC' })}</p><p className="mt-1 font-semibold">{date.getUTCMonth() + 1}/{date.getUTCDate()}</p></div>
}

function TimeLabels() {
  return <div className="relative h-[780px] border-r border-[var(--border)] bg-[var(--card)]">{hours.map((hour, index) => <span className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-[var(--muted-foreground)]" key={hour} style={{ top: `${(index / 13) * 100}%` }}>{hour}:00</span>)}</div>
}

function DayColumn({ day, entries, onOpen }: { day: string; entries: CourseCalendarEntry[]; onOpen: (entry: CourseCalendarEntry) => void }) {
  const layouts = layoutDayEntries(entries, day)
  return (
    <div className="relative h-[780px] border-r border-[var(--border)] bg-[var(--card)]">
      <div aria-hidden="true" className="absolute inset-0 grid grid-rows-[repeat(13,minmax(0,1fr))]">{hours.slice(0, 13).map((hour) => <span className="border-b border-[var(--border)]/70" key={hour} />)}</div>
      {layouts.map((entry) => <button className={cn('absolute z-10 overflow-hidden rounded border px-2 py-1 text-left text-xs shadow-sm transition hover:z-20 hover:shadow-md', eventTone(entry))} key={entry.lessonId} onClick={() => onOpen(entry)} style={{ top: `${entry.topPercent}%`, height: `${entry.heightPercent}%`, left: `calc(${(entry.lane / entry.laneCount) * 100}% + 2px)`, width: `calc(${100 / entry.laneCount}% - 4px)` }} type="button"><strong className="block truncate">{entry.title}</strong><span className="mt-0.5 block truncate">{timeRange(entry)}</span><span className="block truncate opacity-80">{entry.teacherSummary.label || entry.classSummary.label || entry.location}</span></button>)}
    </div>
  )
}

function MonthView({ dateKey, days, groups, onOpen }: Props & { groups: Map<string, CourseCalendarEntry[]> }) {
  const activeMonth = dateKey.slice(0, 7)
  return <div className="grid grid-cols-7 border-l border-t border-[var(--border)]" data-testid="calendar-month-grid">{days.map((day) => { const items = groups.get(day) || []; return <section className={cn('min-h-32 border-b border-r border-[var(--border)] p-2', !day.startsWith(activeMonth) && 'bg-[var(--muted)]/45 text-[var(--muted-foreground)]')} key={day}><p className="text-xs font-semibold tabular-nums">{Number(day.slice(-2))}</p><div className="mt-2 grid gap-1">{items.slice(0, 3).map((entry) => <button className={cn('truncate rounded border px-2 py-1 text-left text-xs', eventTone(entry))} key={entry.lessonId} onClick={() => onOpen(entry)} type="button">{shortTime(entry.startAt)} {entry.title}</button>)}{items.length > 3 ? <p className="px-1 text-xs text-[var(--muted-foreground)]">另有 {items.length - 3} 节</p> : null}</div></section> })}</div>
}

function AgendaList({ entries, groups, onOpen }: { entries: CourseCalendarEntry[]; groups: Map<string, CourseCalendarEntry[]>; onOpen: (entry: CourseCalendarEntry) => void }) {
  if (!entries.length) return null
  return <div data-testid="calendar-agenda"><div className="hidden md:block"><DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">时间</th><th className="px-4 py-3">课程</th><th className="px-4 py-3">教师 / 班级</th><th className="px-4 py-3">地点</th><th className="px-4 py-3">状态</th></tr></thead><tbody>{entries.map((entry) => <tr className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={entry.lessonId} onClick={() => onOpen(entry)}><td className="px-4 py-3 tabular-nums">{fullTime(entry.startAt)}</td><td className="px-4 py-3"><p className="font-semibold">{entry.title}</p><p className="text-xs text-[var(--muted-foreground)]">{calendarOriginLabel(entry.originType)}</p></td><td className="px-4 py-3">{entry.teacherSummary.label || '-'}<span className="block text-xs text-[var(--muted-foreground)]">{entry.classSummary.label}</span></td><td className="px-4 py-3">{entry.location || '-'}</td><td className="px-4 py-3"><Badge tone={entry.rawStatus === 'cancelled' ? 'red' : entry.rawStatus === 'completed' || entry.rawStatus === 'settled' ? 'green' : 'blue'}>{calendarStatusLabel(entry.rawStatus)}</Badge></td></tr>)}</tbody></DataTable></div><div className="grid divide-y divide-[var(--border)] md:hidden">{[...groups].map(([day, items]) => <section key={day}><h3 className="bg-[var(--muted)] px-4 py-2 text-xs font-semibold">{friendlyDay(day)}</h3>{items.map((entry) => <button className="grid w-full gap-1 px-4 py-3 text-left" key={entry.lessonId} onClick={() => onOpen(entry)} type="button"><span className="text-xs tabular-nums text-[var(--primary)]">{timeRange(entry)}</span><strong>{entry.title}</strong><span className="text-sm text-[var(--muted-foreground)]">{entry.teacherSummary.label || entry.classSummary.label || '教师待定'} · {entry.location || '地点待定'}</span></button>)}</section>)}</div></div>
}

function eventTone(entry: CourseCalendarEntry) {
  if (entry.rawStatus === 'cancelled') return 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--destructive)]'
  if (entry.originType === 'appointment') return 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]'
  if (entry.originType === 'class') return 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--accent-foreground)]'
  return 'border-[var(--point-border)] bg-[var(--warning-soft)] text-[var(--warning-foreground)]'
}

function timeRange(entry: CourseCalendarEntry) { return `${shortTime(entry.startAt)}-${shortTime(entry.endAt)}` }
function shortTime(value: string | null) { return value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }) : '--:--' }
function fullTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }) : '时间待定' }
function friendlyDay(day: string) { const date = new Date(`${day}T12:00:00.000Z`); return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${date.toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'UTC' })}` }
const hours = Array.from({ length: 14 }, (_, index) => index + 8)
