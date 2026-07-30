import { request, toQuery } from './http'
import type {
  BookingAppointment,
  BookingAppointmentDetail,
  BookingAppointmentQuery,
  BookingAvailability,
  BookingAvailabilityOverride,
  BookingBackfillPreview,
  BookingBackfillResult,
  BookingCommandResult,
  BookingConflict,
  BookingDashboard,
  BookingEvent,
  BookingListQuery,
  BookingOffering,
  BookingOfferingInput,
  BookingPage,
  BookingPolicy,
  BookingPolicyInput,
  BookingReferenceData,
  BookingWeeklyRule,
} from './bookingTypes'

export interface BookingOpsApi {
  getBookingDashboard(token: string): Promise<BookingDashboard>
  getBookingReferenceData(token: string): Promise<BookingReferenceData>
  listBookingAppointments(token: string, query?: BookingAppointmentQuery): Promise<BookingPage<BookingAppointment>>
  getBookingAppointment(token: string, appointmentId: string): Promise<BookingAppointmentDetail>
  confirmBookingAppointment(token: string, appointmentId: string): Promise<BookingCommandResult>
  declineBookingAppointment(token: string, appointmentId: string, reason: string): Promise<BookingCommandResult>
  cancelBookingAppointment(token: string, appointmentId: string, reason: string): Promise<BookingCommandResult>
  rescheduleBookingAppointment(token: string, appointmentId: string, newStartAt: string, newEndAt: string, reason: string): Promise<BookingCommandResult>
  listBookingPolicies(token: string, query?: BookingListQuery): Promise<BookingPage<BookingPolicy>>
  createBookingPolicy(token: string, data: BookingPolicyInput): Promise<BookingCommandResult>
  listBookingOfferings(token: string, query?: BookingListQuery): Promise<BookingPage<BookingOffering>>
  saveBookingOffering(token: string, offeringId: string | null, data: BookingOfferingInput): Promise<BookingCommandResult>
  getBookingAvailability(token: string, query?: BookingListQuery): Promise<BookingAvailability>
  saveBookingWeeklyAvailability(token: string, offeringId: string, rules: BookingWeeklyRule[]): Promise<BookingCommandResult>
  createBookingAvailabilityOverride(token: string, offeringId: string, data: Omit<BookingAvailabilityOverride, 'id' | 'teacherId' | 'offeringId' | 'status'>): Promise<BookingCommandResult>
  cancelBookingAvailabilityOverride(token: string, overrideId: string): Promise<BookingCommandResult>
  listBookingConflicts(token: string, query?: BookingListQuery): Promise<BookingPage<BookingConflict>>
  resolveBookingConflict(token: string, conflictId: string, resolution: string): Promise<BookingCommandResult>
  previewBookingBackfill(token: string, from: string, to?: string): Promise<BookingBackfillPreview>
  applyBookingBackfill(token: string, from: string, to?: string): Promise<BookingBackfillResult>
}

export function createHttpBookingOpsApi(baseUrl: string): BookingOpsApi {
  const command = <T>(token: string, path: string, body?: unknown, method = 'POST') => request<T>(`${baseUrl}${path}`, {
    method,
    token,
    body,
    headers: { 'Idempotency-Key': idempotencyKey(path) },
  })
  return {
    getBookingDashboard: (token) => request(`${baseUrl}/course-bookings/dashboard`, { token }),
    getBookingReferenceData: (token) => request(`${baseUrl}/course-bookings/reference-data`, { token }),
    listBookingAppointments: (token, query = {}) => request(`${baseUrl}/course-bookings/appointments${toQuery(query)}`, { token }),
    getBookingAppointment: (token, id) => request(`${baseUrl}/course-bookings/appointments/${encodeURIComponent(id)}`, { token }),
    confirmBookingAppointment: (token, id) => command(token, `/course-bookings/appointments/${encodeURIComponent(id)}/confirm`, {}),
    declineBookingAppointment: (token, id, reason) => command(token, `/course-bookings/appointments/${encodeURIComponent(id)}/decline`, { reason }),
    cancelBookingAppointment: (token, id, reason) => command(token, `/course-bookings/appointments/${encodeURIComponent(id)}/cancel`, { reason }),
    rescheduleBookingAppointment: (token, id, newStartAt, newEndAt, reason) => command(token, `/course-bookings/appointments/${encodeURIComponent(id)}/reschedule`, { newStartAt, newEndAt, reason }),
    listBookingPolicies: (token, query = {}) => request(`${baseUrl}/course-bookings/policies${toQuery(query)}`, { token }),
    createBookingPolicy: (token, data) => command(token, '/course-bookings/policies', data),
    listBookingOfferings: (token, query = {}) => request(`${baseUrl}/course-bookings/offerings${toQuery(query)}`, { token }),
    saveBookingOffering: (token, id, data) => command(token, id ? `/course-bookings/offerings/${encodeURIComponent(id)}` : '/course-bookings/offerings', data, id ? 'PATCH' : 'POST'),
    getBookingAvailability: (token, query = {}) => request(`${baseUrl}/course-bookings/availability${toQuery(query)}`, { token }),
    saveBookingWeeklyAvailability: (token, id, rules) => command(token, `/course-bookings/offerings/${encodeURIComponent(id)}/availability`, { rules }, 'PUT'),
    createBookingAvailabilityOverride: (token, id, data) => command(token, `/course-bookings/offerings/${encodeURIComponent(id)}/availability-overrides`, data),
    cancelBookingAvailabilityOverride: (token, id) => command(token, `/course-bookings/availability-overrides/${encodeURIComponent(id)}/cancel`),
    listBookingConflicts: (token, query = {}) => request(`${baseUrl}/course-bookings/conflicts${toQuery(query)}`, { token }),
    resolveBookingConflict: (token, id, resolution) => command(token, `/course-bookings/conflicts/${encodeURIComponent(id)}/resolve`, { resolution }),
    previewBookingBackfill: (token, from, to) => request(`${baseUrl}/course-bookings/backfill/preview${toQuery({ from, to })}`, { token }),
    applyBookingBackfill: (token, from, to) => command(token, '/course-bookings/backfill', { from, to }),
  }
}

export function createMockBookingOpsApi(): BookingOpsApi {
  const store = createMockBookingStore()
  return {
    async getBookingDashboard() {
      return dashboard(store)
    },
    async getBookingReferenceData() {
      return clone(store.referenceData)
    },
    async listBookingAppointments(_token, query = {}) {
      return page(filterAppointments(store.appointments, query), query.page, query.perPage)
    },
    async getBookingAppointment(_token, id) {
      const appointment = requireAppointment(store, id)
      return clone({ ...appointment, events: store.events.filter((item) => item.appointmentId === id), claims: store.claims.filter((item) => item.appointmentId === id) })
    },
    async confirmBookingAppointment(_token, id) {
      const appointment = requirePendingAppointment(store, id)
      Object.assign(appointment, { status: 'confirmed', lessonId: `lesson_${id}`, canCancel: true, canConfirm: false, canDecline: false })
      store.events.push({ id: `event_confirm_${id}`, appointmentId: id, eventType: 'confirmed', fromStatus: 'pending', toStatus: 'confirmed', actorRole: 'admin', created: new Date().toISOString() })
      return { appointmentId: id, lessonId: appointment.lessonId, status: 'confirmed' }
    },
    async declineBookingAppointment(_token, id, reason) {
      const appointment = requirePendingAppointment(store, id)
      Object.assign(appointment, { status: 'declined', responseReason: reason, canConfirm: false, canDecline: false })
      store.events.push({ id: `event_decline_${id}`, appointmentId: id, eventType: 'declined', fromStatus: 'pending', toStatus: 'declined', actorRole: 'admin', reason, created: new Date().toISOString() })
      return { appointmentId: id, status: 'declined' }
    },
    async cancelBookingAppointment(_token, id, reason) {
      const appointment = requireAppointment(store, id)
      appointment.status = 'cancelled'
      appointment.responseReason = reason
      appointment.canCancel = false
      return { appointmentId: id, status: 'cancelled' }
    },
    async rescheduleBookingAppointment(_token, id, newStartAt, newEndAt, reason) {
      const appointment = requireAppointment(store, id)
      Object.assign(appointment, { startAt: newStartAt, endAt: newEndAt, responseReason: reason, status: 'rescheduled' })
      return { appointmentId: id, newStartAt, newEndAt, status: 'rescheduled' }
    },
    async listBookingPolicies(_token, query = {}) {
      return page(store.policies.filter((item) => !query.status || item.status === query.status), query.page, query.perPage)
    },
    async createBookingPolicy(_token, data) {
      const policy: BookingPolicy = { ...data, id: `policy_${store.policies.length + 1}`, version: store.policies.length + 1, effectiveTo: data.effectiveTo || null }
      if (policy.status === 'active') store.policies.forEach((item) => { if (item.code === policy.code) item.status = 'inactive' })
      store.policies.unshift(policy)
      store.referenceData.policies = store.policies.filter((item) => item.status === 'active')
      return { policyId: policy.id, status: policy.status, version: policy.version }
    },
    async listBookingOfferings(_token, query = {}) {
      const items = store.offerings.filter((item) => (!query.status || item.status === query.status)
        && (!query.teacherId || item.teacher.teacherId === query.teacherId)
        && (!query.courseSpecId || item.course.courseId === query.courseSpecId))
      return page(items, query.page, query.perPage)
    },
    async saveBookingOffering(_token, offeringId, data) {
      const teacher = store.referenceData.teachers.find((item) => item.id === data.teacherId)
      const course = store.referenceData.courses.find((item) => item.id === data.courseSpecId)
      if (!teacher || !course) throw new Error('教师或课程不存在')
      const current = offeringId ? store.offerings.find((item) => item.id === offeringId) : null
      if (offeringId && !current) throw new Error('预约配置不存在')
      const record: BookingOffering = {
        id: current?.id || `offering_${store.offerings.length + 1}`,
        teacher: { teacherId: teacher.id, name: teacher.name, avatar: teacher.avatar },
        course: { courseId: course.id, name: course.name },
        creditTypeId: data.creditTypeId,
        policyId: data.policyId,
        location: data.location,
        availabilityMode: current?.availabilityMode || 'default',
        status: data.status,
        version: (current?.version || 0) + 1,
      }
      if (current) Object.assign(current, record)
      else store.offerings.unshift(record)
      return { offeringId: record.id, status: record.status, version: record.version }
    },
    async getBookingAvailability(_token, query = {}) {
      return {
        rules: clone(store.rules.filter((item) => !query.offeringId || item.offeringId === query.offeringId)),
        overrides: clone(store.overrides.filter((item) => !query.offeringId || item.offeringId === query.offeringId)),
      }
    },
    async saveBookingWeeklyAvailability(_token, offeringId, rules) {
      store.rules = store.rules.filter((item) => item.offeringId !== offeringId)
      store.rules.push(...rules.map((item, index) => ({ ...item, id: `rule_${Date.now()}_${index}`, offeringId, status: 'active' as const })))
      const offering = store.offerings.find((item) => item.id === offeringId)
      if (offering) offering.availabilityMode = rules.length ? 'custom' : 'default'
      return { offeringId, ruleCount: rules.length, availabilityMode: rules.length ? 'custom' : 'default' }
    },
    async createBookingAvailabilityOverride(_token, offeringId, data) {
      const record: BookingAvailabilityOverride = { ...data, id: `override_${store.overrides.length + 1}`, offeringId, teacherId: store.offerings.find((item) => item.id === offeringId)?.teacher.teacherId || '', status: 'active' }
      store.overrides.unshift(record)
      return { offeringId, overrideId: record.id, status: 'active' }
    },
    async cancelBookingAvailabilityOverride(_token, id) {
      const record = store.overrides.find((item) => item.id === id)
      if (!record) throw new Error('临时时间不存在')
      record.status = 'cancelled'
      return { overrideId: id, status: 'cancelled' }
    },
    async listBookingConflicts(_token, query = {}) {
      return page(store.conflicts.filter((item) => !query.status || item.status === query.status), query.page, query.perPage)
    },
    async resolveBookingConflict(_token, id, resolution) {
      const conflict = store.conflicts.find((item) => item.id === id)
      if (!conflict) throw new Error('冲突不存在')
      Object.assign(conflict, { resolution, resolvedAt: new Date().toISOString(), status: 'resolved' })
      return { conflictId: id, status: 'resolved' }
    },
    async previewBookingBackfill() {
      const conflicts = store.conflicts.filter((item) => item.status === 'open')
      return { claimed: 3, conflicts: clone(conflicts), ready: conflicts.length === 0, scannedCount: 4 }
    },
    async applyBookingBackfill() {
      return { claimedSessionIds: ['lesson_1', 'lesson_2', 'lesson_3'], conflictCount: store.conflicts.filter((item) => item.status === 'open').length, disabledOfferingIds: [], operationId: 'mock-backfill', scannedCount: 4 }
    },
  }
}

function createMockBookingStore() {
  const policies: BookingPolicy[] = [{
    id: 'policy_1', code: 'default', name: '常规一对一预约', timezone: 'Asia/Shanghai',
    defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }],
    slotStepMinutes: 30, claimGranularityMinutes: 15, minLeadMinutes: 720, maxAdvanceDays: 30,
    responseTtlMinutes: 1440, responseCutoffMinutes: 360, cancellationCutoffMinutes: 720,
    version: 1, effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: null, status: 'active',
  }]
  const referenceData: BookingReferenceData = {
    teachers: [{ id: 'teacher_1', name: '林老师', cellphone: '13800138001', avatar: '' }, { id: 'teacher_2', name: '周老师', cellphone: '13800138002', avatar: '' }],
    courses: [{ id: 'course_1', code: 'VOICE-1V1', name: '一对一声乐课', durationMinutes: 60, defaultCreditTypeId: 'credit_1' }],
    creditTypes: [{ id: 'credit_1', code: 'VOICE-HOUR', name: '一对一声乐课时', courseSpecId: 'course_1', unitLabel: '课时' }],
    policies,
  }
  const offerings: BookingOffering[] = [{ id: 'offering_1', teacher: { teacherId: 'teacher_1', name: '林老师' }, course: { courseId: 'course_1', name: '一对一声乐课' }, creditTypeId: 'credit_1', policyId: 'policy_1', location: '二号琴房', availabilityMode: 'custom', status: 'active', version: 1 }]
  const appointments: BookingAppointment[] = [
    appointment('appointment_1', 'pending', '2026-08-03T01:00:00.000Z', '张同学'),
    appointment('appointment_2', 'confirmed', '2026-08-04T06:00:00.000Z', '李同学'),
    appointment('appointment_3', 'fulfilled', '2026-07-28T06:00:00.000Z', '王同学'),
  ]
  return {
    appointments,
    policies,
    offerings,
    referenceData,
    events: [{ id: 'event_1', appointmentId: 'appointment_1', eventType: 'requested', toStatus: 'pending', actorRole: 'student', created: '2026-08-01T02:00:00.000Z' }] as Array<BookingEvent & { appointmentId: string }>,
    claims: [{ id: 'claim_1', appointmentId: 'appointment_2', ownerType: 'teacher' as const, ownerId: 'teacher_1', cellStartAt: '2026-08-04T06:00:00.000Z', cellEndAt: '2026-08-04T06:15:00.000Z', status: 'active' as const }],
    rules: [{ id: 'rule_1', teacherId: 'teacher_1', offeringId: 'offering_1', weekday: 1, startMinute: 540, endMinute: 660, status: 'active' }] as BookingWeeklyRule[],
    overrides: [{ id: 'override_1', teacherId: 'teacher_1', offeringId: 'offering_1', type: 'unavailable', startAt: '2026-08-10T01:00:00.000Z', endAt: '2026-08-10T02:00:00.000Z', reason: '教师培训', status: 'active' }] as BookingAvailabilityOverride[],
    conflicts: [{ id: 'conflict_1', type: 'teacher_overlap', status: 'open', teacherId: 'teacher_1', sessionId: 'lesson_legacy', startAt: '2026-08-12T01:00:00.000Z', endAt: '2026-08-12T02:00:00.000Z', details: { reason: '历史课堂时间重叠' } }] as BookingConflict[],
  }
}

function appointment(id: string, status: BookingAppointment['status'], startAt: string, studentName: string): BookingAppointment {
  const start = new Date(startAt)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    appointmentId: id, status, course: { courseId: 'course_1', name: '一对一声乐课' },
    teacher: { teacherId: 'teacher_1', name: '林老师' }, student: { studentId: `student_${id.at(-1)}`, name: studentName },
    startAt: start.toISOString(), endAt: end.toISOString(), location: '二号琴房', note: '', responseReason: '',
    responseDeadline: '2026-08-02T01:00:00.000Z', lessonId: status === 'confirmed' ? 'lesson_2' : '',
    canCancel: status === 'confirmed', canConfirm: status === 'pending', canDecline: status === 'pending', version: 1,
  }
}

function dashboard(store: ReturnType<typeof createMockBookingStore>): BookingDashboard {
  const pending = store.appointments.filter((item) => item.status === 'pending')
  const upcoming = store.appointments.filter((item) => ['confirmed', 'rescheduled'].includes(item.status))
  const openConflicts = store.conflicts.filter((item) => item.status === 'open')
  return { pending: clone(pending), pendingCount: pending.length, upcoming: clone(upcoming), openConflicts: clone(openConflicts), openConflictCount: openConflicts.length }
}

function filterAppointments(items: BookingAppointment[], query: BookingAppointmentQuery) {
  const statuses = String(query.status || '').split(',').filter(Boolean)
  return items.filter((item) => (!statuses.length || statuses.includes(item.status))
    && (!query.teacherId || item.teacher.teacherId === query.teacherId)
    && (!query.studentId || item.student.studentId === query.studentId)
    && (!query.courseSpecId || item.course.courseId === query.courseSpecId)
    && (!query.from || Date.parse(item.endAt) > Date.parse(query.from))
    && (!query.to || Date.parse(item.startAt) < Date.parse(query.to)))
}

function requireAppointment(store: ReturnType<typeof createMockBookingStore>, id: string) {
  const record = store.appointments.find((item) => item.appointmentId === id)
  if (!record) throw new Error('预约不存在')
  return record
}

function requirePendingAppointment(store: ReturnType<typeof createMockBookingStore>, id: string) {
  const record = requireAppointment(store, id)
  if (record.status !== 'pending') throw new Error('预约已被处理')
  return record
}

function page<T>(items: T[], requestedPage = 1, requestedPerPage = 20): BookingPage<T> {
  const current = Math.max(1, Number(requestedPage) || 1)
  const perPage = Math.max(1, Number(requestedPerPage) || 20)
  return { items: clone(items.slice((current - 1) * perPage, current * perPage)), page: current, perPage, totalItems: items.length, totalPages: items.length ? Math.ceil(items.length / perPage) : 0 }
}

function clone<T>(value: T): T { return structuredClone(value) }
function idempotencyKey(scope: string) { return `${scope}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}` }
