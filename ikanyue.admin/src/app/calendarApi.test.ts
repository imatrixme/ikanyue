import { describe, expect, it, vi } from 'vitest'

import { createHttpCourseCalendarApi, createMockCourseCalendarApi } from './calendarApi'

const range = { from: '2026-08-02T16:00:00.000Z', to: '2026-08-09T16:00:00.000Z' }

describe('course calendar api', () => {
  it('filters the mock institution calendar and builds facets', async () => {
    const api = createMockCourseCalendarApi()
    const all = await api.getCourseCalendar('token', range)
    expect(all.items).toHaveLength(4)
    expect(all.facets.teachers).toEqual([{ id: 'teacher_1', name: '周老师' }])
    expect(all.facets.students).toHaveLength(2)
    expect((await api.getCourseCalendar('token', { ...range, studentId: 'student_1' })).items).toHaveLength(2)
    expect((await api.getCourseCalendar('token', { ...range, classId: 'class_2' })).items[0].title).toBe('合唱排练')
    expect((await api.getCourseCalendar('token', { ...range, teacherId: 'missing' })).items).toHaveLength(0)
    expect((await api.getCourseCalendar('token', { ...range, courseSpecId: 'course_1', status: 'scheduled', originType: 'admin,class' })).items).toHaveLength(4)
    expect((await api.getCourseCalendar('token', { ...range, courseSpecId: 'missing' })).items).toEqual([])
    expect((await api.getCourseCalendar('token', { ...range, status: 'cancelled' })).items).toEqual([])
    expect((await api.getCourseCalendar('token', { ...range, originType: 'appointment' })).items).toEqual([])
    expect((await api.getCourseCalendar('token', { from: '2027-01-01T00:00:00Z', to: '2027-01-02T00:00:00Z' })).items).toEqual([])
  })

  it('maps the HTTP query to the protected institution route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10000, data: { items: [] } }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpCourseCalendarApi('/ops')
    await api.getCourseCalendar('token', { ...range, teacherId: 'teacher 1', status: 'scheduled' })
    expect(fetchMock.mock.calls[0][0]).toBe('/ops/course-calendar?from=2026-08-02T16%3A00%3A00.000Z&to=2026-08-09T16%3A00%3A00.000Z&teacherId=teacher+1&status=scheduled')
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer token')
  })
})
