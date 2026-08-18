import { addDateDays, shanghaiLocalInput, shanghaiLocalInputToIso } from './calendarLogic'
import type { CourseCalendarEntry, CourseCalendarView } from './calendarTypes'

export type CourseCalendarMode = 'browse' | 'schedule'

export interface CalendarScheduleSelection {
  teacherId: string
  teacherName: string
  startAt: string
  endAt: string
}

export interface ScheduleInterval {
  startAt: string
  endAt: string
}

export const SCHEDULER_DAY_START = 8 * 60
export const SCHEDULER_DAY_END = 21 * 60
export const SCHEDULER_SLOT_MINUTES = 30
export const SCHEDULER_SLOT_COUNT = (SCHEDULER_DAY_END - SCHEDULER_DAY_START) / SCHEDULER_SLOT_MINUTES

export function normalizeCalendarMode(value: string | null, teacherOnly: boolean): CourseCalendarMode {
  if (teacherOnly) return 'schedule'
  return value === 'schedule' ? 'schedule' : 'browse'
}

export function calendarViewForContext(value: string | null, mode: CourseCalendarMode, teacherOnly: boolean): CourseCalendarView {
  const explicit = value === 'day' || value === 'week' || value === 'month' || value === 'list' ? value : null
  if (teacherOnly) return explicit === 'day' || explicit === 'week' ? explicit : 'week'
  if (mode === 'schedule') return explicit === 'day' || explicit === 'week' ? explicit : 'day'
  return explicit || 'week'
}

export function selectionFromSlots(
  dayKey: string,
  teacher: { id: string; name: string },
  anchorSlot: number,
  activeSlot = anchorSlot,
): CalendarScheduleSelection {
  const first = clampSlot(Math.min(anchorSlot, activeSlot))
  const last = clampSlot(Math.max(anchorSlot, activeSlot))
  const startMinute = SCHEDULER_DAY_START + first * SCHEDULER_SLOT_MINUTES
  const endMinute = Math.min(SCHEDULER_DAY_END, SCHEDULER_DAY_START + (last + (first === last ? 2 : 1)) * SCHEDULER_SLOT_MINUTES)
  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    startAt: shanghaiLocalInputToIso(`${dayKey}T${minuteText(startMinute)}`),
    endAt: shanghaiLocalInputToIso(`${dayKey}T${minuteText(endMinute)}`),
  }
}

export function weeklyIntervals(selection: CalendarScheduleSelection, count: number): ScheduleInterval[] {
  const repeatCount = [1, 4, 8].includes(count) ? count : 1
  const start = shanghaiLocalInput(selection.startAt)
  const end = shanghaiLocalInput(selection.endAt)
  return Array.from({ length: repeatCount }, (_, index) => ({
    startAt: shanghaiLocalInputToIso(`${addDateDays(start.slice(0, 10), index * 7)}T${start.slice(11)}`),
    endAt: shanghaiLocalInputToIso(`${addDateDays(end.slice(0, 10), index * 7)}T${end.slice(11)}`),
  }))
}

export function scheduleConflicts(
  entries: CourseCalendarEntry[],
  intervals: ScheduleInterval[],
  teacherId: string,
  classId: string,
): CourseCalendarEntry[] {
  return entries.filter((entry) => {
    if (!entry.startAt || !entry.endAt || entry.rawStatus === 'cancelled') return false
    const sameResource = entry.relationIds.teacherIds.includes(teacherId)
      || Boolean(classId && entry.relationIds.classIds.includes(classId))
    return sameResource && intervals.some((interval) => overlaps(interval.startAt, interval.endAt, entry.startAt!, entry.endAt!))
  })
}

export function slotIsOccupied(entries: CourseCalendarEntry[], teacherId: string, dayKey: string, slot: number): boolean {
  const selection = selectionFromSlots(dayKey, { id: teacherId, name: '' }, slot, slot)
  const slotEnd = new Date(Date.parse(selection.startAt) + SCHEDULER_SLOT_MINUTES * 60_000).toISOString()
  return entries.some((entry) => entry.rawStatus !== 'cancelled'
    && entry.relationIds.teacherIds.includes(teacherId)
    && entry.startAt && entry.endAt
    && overlaps(selection.startAt, slotEnd, entry.startAt, entry.endAt))
}

export function schedulerLessonCode(startAt: string, occurrence: number): string {
  const local = shanghaiLocalInput(startAt).replace(/[-:T]/g, '')
  return `SCH-${local}-${String(occurrence + 1).padStart(2, '0')}`
}

export function durationMinutes(startAt: string, endAt: string): number {
  const duration = (Date.parse(endAt) - Date.parse(startAt)) / 60_000
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

export function slotTimeLabel(slot: number): string {
  return minuteText(SCHEDULER_DAY_START + clampSlot(slot) * SCHEDULER_SLOT_MINUTES)
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(leftEnd) > Date.parse(rightStart)
}

function clampSlot(slot: number): number {
  return Math.max(0, Math.min(SCHEDULER_SLOT_COUNT - 1, Math.floor(slot)))
}

function minuteText(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
