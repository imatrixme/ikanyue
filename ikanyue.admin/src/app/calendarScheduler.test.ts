import { describe, expect, it } from 'vitest'

import type { CourseCalendarEntry } from './calendarTypes'
import {
  calendarViewForContext,
  durationMinutes,
  normalizeCalendarMode,
  scheduleConflicts,
  schedulerLessonCode,
  selectionFromSlots,
  slotIsOccupied,
  slotTimeLabel,
  weeklyIntervals,
} from './calendarScheduler'

describe('calendar scheduler logic', () => {
  it('uses role-aware mode and view defaults while preserving compatible explicit views', () => {
    expect(normalizeCalendarMode(null, false)).toBe('browse')
    expect(normalizeCalendarMode('schedule', false)).toBe('schedule')
    expect(normalizeCalendarMode('browse', true)).toBe('schedule')
    expect(calendarViewForContext(null, 'schedule', false)).toBe('day')
    expect(calendarViewForContext(null, 'schedule', true)).toBe('week')
    expect(calendarViewForContext('day', 'schedule', true)).toBe('day')
    expect(calendarViewForContext('month', 'schedule', true)).toBe('week')
    expect(calendarViewForContext('list', 'browse', false)).toBe('list')
  })

  it('turns clicked and dragged slots into Shanghai intervals', () => {
    const teacher = { id: 'teacher-1', name: '周老师' }
    expect(selectionFromSlots('2026-08-03', teacher, 2)).toMatchObject({
      teacherId: 'teacher-1', startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-03T02:00:00.000Z',
    })
    expect(selectionFromSlots('2026-08-03', teacher, 5, 3)).toMatchObject({
      startAt: '2026-08-03T01:30:00.000Z', endAt: '2026-08-03T03:00:00.000Z',
    })
    expect(slotTimeLabel(0)).toBe('08:00')
    expect(slotTimeLabel(25)).toBe('20:30')
  })

  it('creates supported weekly occurrences and stable lesson codes', () => {
    const selection = selectionFromSlots('2026-08-03', { id: 'teacher-1', name: '周老师' }, 2)
    expect(weeklyIntervals(selection, 4).map((item) => item.startAt)).toEqual([
      '2026-08-03T01:00:00.000Z', '2026-08-10T01:00:00.000Z',
      '2026-08-17T01:00:00.000Z', '2026-08-24T01:00:00.000Z',
    ])
    expect(weeklyIntervals(selection, 3)).toHaveLength(1)
    expect(schedulerLessonCode(selection.startAt, 0)).toBe('SCH-202608030900-01')
    expect(durationMinutes(selection.startAt, selection.endAt)).toBe(60)
  })

  it('detects visible teacher and class overlaps while ignoring cancelled lessons', () => {
    const scheduled = entry('scheduled', 'teacher-1', 'class-1', '2026-08-03T01:00:00.000Z', '2026-08-03T02:00:00.000Z')
    const cancelled = { ...entry('cancelled', 'teacher-1', 'class-1', '2026-08-03T03:00:00.000Z', '2026-08-03T04:00:00.000Z'), rawStatus: 'cancelled' }
    const interval = [{ startAt: '2026-08-03T01:30:00.000Z', endAt: '2026-08-03T02:30:00.000Z' }]
    expect(scheduleConflicts([scheduled, cancelled], interval, 'teacher-1', '')).toEqual([scheduled])
    expect(scheduleConflicts([scheduled], interval, 'other', 'class-1')).toEqual([scheduled])
    expect(slotIsOccupied([scheduled], 'teacher-1', '2026-08-03', 2)).toBe(true)
    expect(slotIsOccupied([cancelled], 'teacher-1', '2026-08-03', 6)).toBe(false)
  })
})

function entry(id: string, teacherId: string, classId: string, startAt: string, endAt: string): CourseCalendarEntry {
  const summary = { count: 0, items: [], label: '', overflow: 0 }
  return {
    lessonId: id, title: id, course: { courseId: 'course-1', name: '课程', deliveryMode: '' },
    startAt, endAt, location: '', status: 'scheduled', rawStatus: 'scheduled', originType: 'class',
    adjusted: false, attention: '', teacherSummary: summary, classSummary: summary, participantSummary: summary,
    appointmentId: null, version: 1, relationIds: { teacherIds: [teacherId], studentIds: [], classIds: [classId] },
  }
}
