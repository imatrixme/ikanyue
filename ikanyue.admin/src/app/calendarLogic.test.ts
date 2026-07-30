import { describe, expect, it, vi } from 'vitest'

import type { CourseCalendarEntry } from './calendarTypes'
import {
  addDateDays,
  calendarOriginLabel,
  calendarRange,
  calendarStatusLabel,
  dateKeyInShanghai,
  groupCalendarEntries,
  layoutDayEntries,
  monthGridDays,
  normalizeCalendarView,
  normalizeDateKey,
  shanghaiLocalInput,
  shanghaiLocalInputToIso,
  shiftCalendarDate,
  startOfMonth,
  startOfWeek,
  todayKey,
  visibleCalendarDays,
} from './calendarLogic'

describe('course calendar date and layout logic', () => {
  it('normalizes views, dates, and Shanghai boundaries', () => {
    expect(['day', 'week', 'month', 'list', 'bad'].map(normalizeCalendarView)).toEqual(['day', 'week', 'month', 'list', 'week'])
    expect(normalizeDateKey('2026-08-03')).toBe('2026-08-03')
    expect(normalizeDateKey('bad', '2026-01-01')).toBe('2026-01-01')
    expect(addDateDays('2026-08-01', 2)).toBe('2026-08-03')
    expect(startOfWeek('2026-08-01')).toBe('2026-07-27')
    expect(startOfMonth('2026-08-18')).toBe('2026-08-01')
    expect(monthGridDays('2026-08-18')).toHaveLength(42)
    expect(monthGridDays('2026-08-18').at(-1)).toBe('2026-09-06')
    expect(calendarRange('day', '2026-08-03')).toEqual({
      from: '2026-08-02T16:00:00.000Z', to: '2026-08-03T16:00:00.000Z',
    })
    expect(calendarRange('week', '2026-08-03').to).toBe('2026-08-09T16:00:00.000Z')
    expect(calendarRange('month', '2026-08-03').from).toBe('2026-07-26T16:00:00.000Z')
    expect(visibleCalendarDays('list', '2026-08-03')).toHaveLength(42)
    expect(dateKeyInShanghai('2026-08-02T16:00:00.000Z')).toBe('2026-08-03')
    expect(dateKeyInShanghai('invalid')).toBe('')
    expect(todayKey(new Date('2026-08-02T16:00:00.000Z'))).toBe('2026-08-03')
  })

  it('shifts each view without month-end overflow', () => {
    expect(shiftCalendarDate('day', '2026-08-03', -1)).toBe('2026-08-02')
    expect(shiftCalendarDate('week', '2026-08-03', 1)).toBe('2026-08-10')
    expect(shiftCalendarDate('list', '2026-08-03', 1)).toBe('2026-09-14')
    expect(shiftCalendarDate('month', '2026-01-31', 1)).toBe('2026-02-01')
  })

  it('round-trips calendar editor values through Asia/Shanghai', () => {
    expect(shanghaiLocalInput('2026-08-01T01:30:00.000Z')).toBe('2026-08-01T09:30')
    expect(shanghaiLocalInput(null)).toBe('')
    expect(shanghaiLocalInput('invalid')).toBe('')
    expect(shanghaiLocalInputToIso('2026-08-01T09:30')).toBe('2026-08-01T01:30:00.000Z')
    expect(shanghaiLocalInputToIso('invalid')).toBe('')
  })

  it('groups entries and assigns deterministic overlap lanes', () => {
    const entries = [
      entry('b', '2026-08-03T01:30:00.000Z', '2026-08-03T02:30:00.000Z'),
      entry('a', '2026-08-03T01:00:00.000Z', '2026-08-03T02:00:00.000Z'),
      entry('c', '2026-08-03T04:00:00.000Z', '2026-08-03T05:00:00.000Z'),
      entry('missing', null, null),
    ]
    const groups = groupCalendarEntries(entries)
    expect(groups.get('2026-08-03')?.map((item) => item.lessonId)).toEqual(['a', 'b', 'c'])
    const layouts = layoutDayEntries(groups.get('2026-08-03') || [], '2026-08-03')
    expect(layouts.find((item) => item.lessonId === 'a')).toMatchObject({ lane: 0, laneCount: 2 })
    expect(layouts.find((item) => item.lessonId === 'b')).toMatchObject({ lane: 1, laneCount: 2 })
    expect(layouts.find((item) => item.lessonId === 'c')).toMatchObject({ lane: 0, laneCount: 1 })
    expect(layouts.every((item) => item.heightPercent > 0)).toBe(true)
    expect(layoutDayEntries([entry('invalid', null, null)], '2026-08-03')).toEqual([])
  })

  it('maps known and unknown status and origin labels', () => {
    expect(calendarStatusLabel('scheduled')).toBe('待上课')
    expect(calendarStatusLabel('unknown')).toBe('unknown')
    expect(calendarOriginLabel('appointment')).toBe('预约成课')
    expect(calendarOriginLabel('legacy')).toBe('legacy')
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-02T16:00:00.000Z'))
    expect(normalizeDateKey(null)).toBe('2026-08-03')
    vi.useRealTimers()
  })
})

function entry(id: string, startAt: string | null, endAt: string | null): CourseCalendarEntry {
  const summary = { count: 0, items: [], label: '', overflow: 0 }
  return {
    lessonId: id, title: id, course: { courseId: 'course', name: '课程', deliveryMode: '' },
    startAt, endAt, location: '', status: 'scheduled', rawStatus: 'scheduled', originType: 'admin',
    adjusted: false, attention: '', teacherSummary: summary, classSummary: summary,
    participantSummary: summary, appointmentId: null, version: 1,
    relationIds: { teacherIds: [], studentIds: [], classIds: [] },
  }
}
