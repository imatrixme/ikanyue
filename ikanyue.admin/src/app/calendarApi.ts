import type { CalendarFacet, CourseCalendarEntry, CourseCalendarQuery, CourseCalendarResponse } from './calendarTypes'
import { request, toQuery } from './http'

export interface CourseCalendarApi {
  getCourseCalendar(token: string, query: CourseCalendarQuery): Promise<CourseCalendarResponse>
}

export function createHttpCourseCalendarApi(baseUrl: string): CourseCalendarApi {
  return {
    getCourseCalendar: (token, query) => request(`${baseUrl}/course-calendar${toQuery(query)}`, { token }),
  }
}

export function createMockCourseCalendarApi(): CourseCalendarApi {
  const items = mockCalendarEntries()
  return {
    async getCourseCalendar(_token, query) {
      const rangeStart = Date.parse(query.from)
      const rangeEnd = Date.parse(query.to)
      const inRange = items.filter((item) => {
        const start = Date.parse(item.startAt!)
        const end = Date.parse(item.endAt!)
        return end > rangeStart && start < rangeEnd
      })
      const filtered = inRange.filter((item) => matchesQuery(item, query))
      return {
        range: { from: query.from, to: query.to, timezone: 'Asia/Shanghai' },
        filters: query as unknown as Record<string, string>,
        facets: {
          teachers: facets(inRange.flatMap((item) => item.teacherSummary.items)),
          students: facets(inRange.flatMap((item) => item.participantSummary.items)),
          classes: facets(inRange.flatMap((item) => item.classSummary.items)),
          courses: facets(inRange.map((item) => ({ id: item.course.courseId, name: item.course.name }))),
        },
        items: filtered,
      }
    },
  }
}

function matchesQuery(item: CourseCalendarEntry, query: CourseCalendarQuery): boolean {
  return (!query.teacherId || item.relationIds.teacherIds.includes(query.teacherId))
    && (!query.studentId || item.relationIds.studentIds.includes(query.studentId))
    && (!query.classId || item.relationIds.classIds.includes(query.classId))
    && (!query.courseSpecId || item.course.courseId === query.courseSpecId)
    && (!query.status || query.status.split(',').includes(item.rawStatus))
    && (!query.originType || query.originType.split(',').includes(item.originType))
}

function facets(items: CalendarFacet[]): CalendarFacet[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function mockCalendarEntries(): CourseCalendarEntry[] {
  return [
    entry('lesson_1', '少儿声乐小课', '2026-08-03T01:00:00.000Z', '2026-08-03T02:00:00.000Z', 'student_1', 'class_1'),
    entry('lesson_2', '成人声乐基础', '2026-08-03T01:30:00.000Z', '2026-08-03T02:30:00.000Z', 'student_2', ''),
    entry('lesson_3', '合唱排练', '2026-08-05T06:00:00.000Z', '2026-08-05T07:30:00.000Z', 'student_1', 'class_2'),
    entry('lesson_4', '视唱练耳', '2026-08-08T08:00:00.000Z', '2026-08-08T09:00:00.000Z', 'student_2', 'class_1'),
  ]
}

function entry(id: string, title: string, startAt: string, endAt: string, studentId: string, classId: string): CourseCalendarEntry {
  const teacher = { id: 'teacher_1', name: '周老师' }
  const student = { id: studentId, name: studentId === 'student_1' ? '林同学' : '陈同学' }
  const classItem = classId ? [{ id: classId, name: classId === 'class_1' ? '少儿声乐 A 班' : '合唱进阶班' }] : []
  const summary = (items: CalendarFacet[]) => ({ count: items.length, items, label: items.map((item) => item.name).join('、'), overflow: 0 })
  return {
    lessonId: id, title, course: { courseId: 'course_1', name: title, deliveryMode: 'offline' },
    startAt, endAt, location: '看乐艺术一号教室', status: 'scheduled', rawStatus: 'scheduled',
    originType: classId ? 'class' : 'admin', adjusted: false, attention: '',
    teacherSummary: summary([teacher]), participantSummary: summary([student]), classSummary: summary(classItem),
    appointmentId: null, version: 1,
    relationIds: { teacherIds: [teacher.id], studentIds: [student.id], classIds: classItem.map((item) => item.id) },
  }
}
