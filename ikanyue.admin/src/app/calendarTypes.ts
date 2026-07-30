export type CourseCalendarView = 'day' | 'week' | 'month' | 'list'

export interface CalendarFacet {
  id: string
  name: string
}

export interface CalendarRelationSummary {
  count: number
  items: CalendarFacet[]
  label: string
  overflow: number
}

export interface CourseCalendarEntry {
  lessonId: string
  title: string
  course: { courseId: string; name: string; deliveryMode: string }
  startAt: string | null
  endAt: string | null
  location: string
  status: string
  rawStatus: string
  originType: string
  adjusted: boolean
  attention: string
  teacherSummary: CalendarRelationSummary
  classSummary: CalendarRelationSummary
  participantSummary: CalendarRelationSummary
  appointmentId: string | null
  version: number
  relationIds: { teacherIds: string[]; studentIds: string[]; classIds: string[] }
}

export interface CourseCalendarQuery {
  from: string
  to: string
  teacherId?: string
  studentId?: string
  classId?: string
  courseSpecId?: string
  status?: string
  originType?: string
}

export interface CourseCalendarResponse {
  range: { from: string; to: string; timezone: 'Asia/Shanghai' }
  filters: Record<string, string | string[]>
  facets: {
    teachers: CalendarFacet[]
    students: CalendarFacet[]
    classes: CalendarFacet[]
    courses: CalendarFacet[]
  }
  items: CourseCalendarEntry[]
}

export interface CalendarLayoutEntry extends CourseCalendarEntry {
  dayKey: string
  lane: number
  laneCount: number
  topPercent: number
  heightPercent: number
}
