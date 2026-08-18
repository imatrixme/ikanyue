import { useRef, useState } from 'react'

import { dateKeyInShanghai } from '../../app/calendarLogic'
import {
  SCHEDULER_DAY_END,
  SCHEDULER_DAY_START,
  SCHEDULER_SLOT_COUNT,
  SCHEDULER_SLOT_MINUTES,
  selectionFromSlots,
  slotIsOccupied,
  slotTimeLabel,
  type CalendarScheduleSelection,
} from '../../app/calendarScheduler'
import type { CalendarFacet, CourseCalendarEntry } from '../../app/calendarTypes'
import { cn } from '../ui/utils'

interface Props {
  dateKey: string
  entries: CourseCalendarEntry[]
  onOpen: (entry: CourseCalendarEntry) => void
  onSelect: (selection: CalendarScheduleSelection) => void
  teachers: CalendarFacet[]
}

interface DragState {
  active: number
  anchor: number
  teacher: CalendarFacet
}

const SLOT_WIDTH = 40
const TIMELINE_WIDTH = SCHEDULER_SLOT_COUNT * SLOT_WIDTH

export function VisualCourseScheduler({ dateKey, entries, onOpen, onSelect, teachers }: Props) {
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  function begin(teacher: CalendarFacet, slot: number) {
    const next = { teacher, anchor: slot, active: slot }
    dragRef.current = next
    setDrag(next)
  }

  function extend(teacher: CalendarFacet, slot: number) {
    const current = dragRef.current
    if (!current || current.teacher.id !== teacher.id) return
    const next = { ...current, active: slot }
    dragRef.current = next
    setDrag(next)
  }

  function finish(teacher: CalendarFacet) {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!current || current.teacher.id !== teacher.id) return
    onSelect(selectionFromSlots(dateKey, teacher, current.anchor, current.active))
  }

  if (!teachers.length) return <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">暂无可排课教师</p>

  return (
    <div className="overflow-x-auto" data-testid="visual-course-scheduler">
      <div className="min-w-max">
        <div className="sticky top-0 z-30 flex h-12 border-y border-[var(--border)] bg-[var(--muted)]">
          <div className="sticky left-0 z-40 flex w-40 shrink-0 items-center border-r border-[var(--border)] bg-[var(--muted)] px-4 text-xs font-semibold">教师</div>
          <div className="relative shrink-0" style={{ width: TIMELINE_WIDTH }}>
            {Array.from({ length: 13 }, (_, index) => <span className="absolute top-0 flex h-full items-center border-l border-[var(--border)] pl-2 text-xs tabular-nums text-[var(--muted-foreground)]" key={index} style={{ left: index * SLOT_WIDTH * 2 }}>{slotTimeLabel(index * 2)}</span>)}
          </div>
        </div>
        {teachers.map((teacher) => {
          const teacherEntries = entries.filter((entry) => entry.relationIds.teacherIds.includes(teacher.id))
          return (
            <div className="flex min-h-20 border-b border-[var(--border)]" data-teacher-id={teacher.id} key={teacher.id}>
              <div className="sticky left-0 z-20 flex w-40 shrink-0 items-center border-r border-[var(--border)] bg-[var(--card)] px-4">
                <div className="min-w-0"><strong className="block truncate text-sm">{teacher.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{teacherEntries.length} 节</span></div>
              </div>
              <div className="relative grid shrink-0 bg-[var(--card)]" style={{ gridTemplateColumns: `repeat(${SCHEDULER_SLOT_COUNT}, ${SLOT_WIDTH}px)`, width: TIMELINE_WIDTH }}>
                {Array.from({ length: SCHEDULER_SLOT_COUNT }, (_, slot) => {
                  const occupied = slotIsOccupied(entries, teacher.id, dateKey, slot)
                  const selected = drag?.teacher.id === teacher.id && slot >= Math.min(drag.anchor, drag.active) && slot <= Math.max(drag.anchor, drag.active)
                  return <button aria-label={`在${teacher.name} ${dateKey} ${slotTimeLabel(slot)}新增排课`} className={cn('h-20 border-r border-[var(--border)]/70 outline-none transition-colors hover:bg-[var(--brand-wash)] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]', slot % 2 === 0 && 'border-l border-l-[var(--border)]', occupied && 'cursor-default bg-[var(--muted)]/40', selected && 'bg-[var(--brand-soft)]')} disabled={occupied} key={slot} onClick={(event) => { if (event.detail === 0) onSelect(selectionFromSlots(dateKey, teacher, slot)) }} onPointerDown={() => begin(teacher, slot)} onPointerEnter={() => extend(teacher, slot)} onPointerUp={() => finish(teacher)} type="button" />
                })}
                {teacherEntries.map((entry) => <LessonBlock entry={entry} key={entry.lessonId} onOpen={onOpen} />)}
                <CurrentTimeLine dateKey={dateKey} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LessonBlock({ entry, onOpen }: { entry: CourseCalendarEntry; onOpen: (entry: CourseCalendarEntry) => void }) {
  if (!entry.startAt || !entry.endAt) return null
  const start = minuteInShanghai(entry.startAt)
  const end = minuteInShanghai(entry.endAt)
  const visibleStart = Math.max(start, SCHEDULER_DAY_START)
  const visibleEnd = Math.min(end, SCHEDULER_DAY_END)
  if (visibleEnd <= visibleStart) return null
  const left = ((visibleStart - SCHEDULER_DAY_START) / SCHEDULER_SLOT_MINUTES) * SLOT_WIDTH
  const width = Math.max(38, ((visibleEnd - visibleStart) / SCHEDULER_SLOT_MINUTES) * SLOT_WIDTH - 4)
  return <button className={cn('absolute z-10 my-2 h-16 overflow-hidden rounded border px-2 py-1 text-left text-xs shadow-sm transition hover:z-20 hover:shadow-md', eventTone(entry))} onClick={(event) => { event.stopPropagation(); onOpen(entry) }} onPointerDown={(event) => event.stopPropagation()} style={{ left: left + 2, width }} type="button"><strong className="block truncate">{entry.title}</strong><span className="mt-0.5 block truncate">{timeLabel(entry.startAt)}-{timeLabel(entry.endAt)}</span><span className="block truncate opacity-80">{entry.classSummary.label || entry.participantSummary.label || entry.location}</span></button>
}

function CurrentTimeLine({ dateKey }: { dateKey: string }) {
  const now = new Date()
  if (dateKeyInShanghai(now.toISOString()) !== dateKey) return null
  const minute = minuteInShanghai(now.toISOString())
  if (minute < SCHEDULER_DAY_START || minute > SCHEDULER_DAY_END) return null
  const left = ((minute - SCHEDULER_DAY_START) / SCHEDULER_SLOT_MINUTES) * SLOT_WIDTH
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--destructive)]" style={{ left }} />
}

function minuteInShanghai(value: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  return Number(parts.find((part) => part.type === 'hour')?.value) * 60 + Number(parts.find((part) => part.type === 'minute')?.value)
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

function eventTone(entry: CourseCalendarEntry) {
  if (entry.rawStatus === 'cancelled') return 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--destructive)]'
  if (entry.originType === 'appointment') return 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]'
  if (entry.originType === 'class') return 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--accent-foreground)]'
  return 'border-[var(--point-border)] bg-[var(--warning-soft)] text-[var(--warning-foreground)]'
}
