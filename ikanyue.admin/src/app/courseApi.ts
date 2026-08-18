import { request, toQuery } from './http'
import type {
  CourseAccount,
  CourseCommandResult,
  CoursePage,
  CourseQuery,
  CourseRecord,
  CourseResourceInput,
  CourseResourceKey,
  CourseWritableResource,
  EnrollmentInput,
  RosterSyncPreview,
  SettlementPreview,
  TeacherCreditConfirmation,
  TeacherOverride,
} from './courseTypes'

export interface CourseOpsApi {
  listCourseResource<T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query?: CourseQuery): Promise<CoursePage<T>>
  getCourseResource<T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, id: string): Promise<T>
  createCourseResource(token: string, resource: CourseWritableResource, data: CourseResourceInput): Promise<CourseRecord>
  updateCourseResource(token: string, resource: CourseWritableResource, id: string, data: CourseResourceInput): Promise<CourseRecord>
  setCourseResourceStatus(token: string, resource: CourseWritableResource, id: string, status: string, reason?: string): Promise<CourseCommandResult>
  createEnrollment(token: string, data: EnrollmentInput): Promise<CourseCommandResult>
  previewEnrollmentSync(token: string, orderId: string): Promise<RosterSyncPreview>
  confirmEnrollmentSync(token: string, orderId: string, previewHash: string, lessonIds?: string[]): Promise<CourseCommandResult>
  setAttendance(token: string, sessionId: string, sessionStudentId: string, attendanceStatus: string): Promise<CourseCommandResult>
  markAllPresent(token: string, sessionId: string): Promise<CourseCommandResult>
  setActualTeacher(token: string, sessionId: string, sessionTeacherId: string, actualStatus: string): Promise<CourseCommandResult>
  previewSettlement(token: string, sessionId: string): Promise<SettlementPreview>
  publishLesson(token: string, sessionId: string, classIds: string[], teacherOverrides?: TeacherOverride[]): Promise<CourseCommandResult>
  rescheduleLesson(token: string, sessionId: string, newStartAt: string, newEndAt: string, reason: string): Promise<CourseCommandResult>
  settleLesson(token: string, sessionId: string): Promise<CourseCommandResult>
  reverseSettlement(token: string, sessionId: string, reason: string): Promise<CourseCommandResult>
  confirmTeacherCredit(token: string, teacherCreditEventId: string, reason: string): Promise<TeacherCreditConfirmation>
  setClassMembership(token: string, classId: string, studentId: string, status: string): Promise<CourseCommandResult>
  transferClassStudent(token: string, classId: string, studentId: string, targetClassId: string): Promise<CourseCommandResult>
  setClassTeacher(token: string, classId: string, teacherId: string, role: string, status: string): Promise<CourseCommandResult>
}

const resourcePaths: Record<CourseResourceKey, string> = {
  courseSpecs: '/course-credits/catalog/course-specs',
  packages: '/course-credits/packages',
  grantLines: '/course-credits/package-grant-lines',
  priceVersions: '/course-credits/price-versions',
  conversionRules: '/course-credits/conversion-rules',
  enrollments: '/course-credits/enrollments',
  classes: '/course-credits/classes',
  classStudents: '/course-credits/class-students',
  classTeachers: '/course-credits/class-teachers',
  lessons: '/course-credits/sessions',
  assignedLessons: '/course-credits/assigned-lessons',
  sessionClasses: '/course-credits/session-classes',
  sessionStudents: '/course-credits/session-students',
  sessionTeachers: '/course-credits/session-teachers',
  accounts: '/course-credits/accounts',
  teacherEvents: '/course-credits/teacher-events',
  settlementExceptions: '/course-credits/settlement-exceptions',
  reconciliationExceptions: '/course-credits/reconciliation/exceptions',
  auditLogs: '/course-credits/audit-logs',
}

export function createHttpCourseOpsApi(baseUrl: string): CourseOpsApi {
  const command = <T>(token: string, path: string, body?: unknown, method = 'POST') => request<T>(`${baseUrl}${path}`, {
    method,
    token,
    body,
    headers: { 'Idempotency-Key': idempotencyKey(path) },
  })
  return {
    listCourseResource(token, resource, query = {}) {
      return request(`${baseUrl}${resourcePaths[resource]}${toQuery(query)}`, { token })
    },
    getCourseResource(token, resource, id) {
      const path = `${resourcePaths[resource]}/${encodeURIComponent(id)}`
      return request(`${baseUrl}${path}`, { token })
    },
    createCourseResource(token, resource, data) {
      return command(token, `/course-operations/${resource}`, data)
    },
    updateCourseResource(token, resource, id, data) {
      return command(token, `/course-operations/${resource}/${encodeURIComponent(id)}`, data, 'PATCH')
    },
    setCourseResourceStatus(token, resource, id, status, reason) {
      return command(token, `/course-operations/${resource}/${encodeURIComponent(id)}/status`, { status, reason })
    },
    createEnrollment(token, data) {
      return command(token, '/course-operations/enrollments', data)
    },
    previewEnrollmentSync(token, orderId) {
      return request(`${baseUrl}/course-operations/enrollments/${encodeURIComponent(orderId)}/sync-preview`, { token })
    },
    confirmEnrollmentSync(token, orderId, previewHash, lessonIds) {
      return command(token, `/course-operations/enrollments/${encodeURIComponent(orderId)}/sync`, { previewHash, lessonIds })
    },
    setAttendance(token, sessionId, sessionStudentId, attendanceStatus) {
      return command(token, `/course-operations/lessons/${encodeURIComponent(sessionId)}/students/${encodeURIComponent(sessionStudentId)}/attendance`, { attendanceStatus })
    },
    markAllPresent(token, sessionId) {
      return command(token, `/course-operations/lessons/${encodeURIComponent(sessionId)}/attendance/all-present`)
    },
    setActualTeacher(token, sessionId, sessionTeacherId, actualStatus) {
      return command(token, `/course-operations/lessons/${encodeURIComponent(sessionId)}/teachers/${encodeURIComponent(sessionTeacherId)}/actual-status`, { actualStatus })
    },
    previewSettlement(token, sessionId) {
      return request(`${baseUrl}/course-operations/lessons/${encodeURIComponent(sessionId)}/settlement-preview`, { token })
    },
    publishLesson(token, sessionId, classIds, teacherOverrides = []) {
      return command(token, `/course-credits/sessions/${encodeURIComponent(sessionId)}/publish`, { classIds, teacherOverrides })
    },
    rescheduleLesson(token, sessionId, newStartAt, newEndAt, reason) {
      return command(token, `/course-credits/sessions/${encodeURIComponent(sessionId)}/reschedule`, { newStartAt, newEndAt, reason })
    },
    settleLesson(token, sessionId) {
      return command(token, `/course-credits/sessions/${encodeURIComponent(sessionId)}/settle`)
    },
    reverseSettlement(token, sessionId, reason) {
      return command(token, `/course-credits/sessions/${encodeURIComponent(sessionId)}/reverse-settlement`, { reason })
    },
    confirmTeacherCredit(token, teacherCreditEventId, reason) {
      return command(token, `/course-credits/teacher-events/${encodeURIComponent(teacherCreditEventId)}/confirm`, { reason })
    },
    setClassMembership(token, classId, studentId, status) {
      return command(token, `/course-credits/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/membership`, { status, effectiveFrom: new Date().toISOString() })
    },
    transferClassStudent(token, classId, studentId, targetClassId) {
      return command(token, `/course-credits/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/transfer`, { toClassId: targetClassId, effectiveAt: new Date().toISOString() })
    },
    setClassTeacher(token, classId, teacherId, role, status) {
      return command(token, `/course-credits/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(teacherId)}/assignment`, { role, status, effectiveFrom: new Date().toISOString() })
    },
  }
}

export function createMockCourseOpsApi(): CourseOpsApi {
  const store = createMockStore()
  return {
    async listCourseResource<T extends CourseRecord = CourseRecord>(_token: string, resource: CourseResourceKey, query: CourseQuery = {}): Promise<CoursePage<T>> {
      const source = resource === 'assignedLessons' ? assignedLessons(store) : store[resource]
      const records = source.filter((record) => matchesQuery(record, query))
      return page(records as T[], query.page, query.perPage)
    },
    async getCourseResource<T extends CourseRecord = CourseRecord>(_token: string, resource: CourseResourceKey, id: string): Promise<T> {
      const record = store[resource].find((item) => item.id === id || item.studentId === id)
      if (!record) throw new Error('课程运营记录不存在')
      return clone(record) as T
    },
    async createCourseResource(_token, resource, data) {
      const key = writableStoreKey(resource)
      const record = { id: `${key}_${store[key].length + 1}`, status: 'draft', ...data }
      store[key].unshift(record as CourseRecord)
      return clone(record as CourseRecord)
    },
    async updateCourseResource(_token, resource, id, data) {
      const key = writableStoreKey(resource)
      const record = requireRecord(store[key], id)
      Object.assign(record, data)
      return clone(record)
    },
    async setCourseResourceStatus(_token, resource, id, status) {
      const record = requireRecord(store[writableStoreKey(resource)], id)
      record.status = status
      return { id, status }
    },
    async createEnrollment(_token, data) {
      const id = `enrollment_${store.enrollments.length + 1}`
      const result = { id, operationNo: `ENR-${id}`, studentId: data.studentId, sourceId: `order_${id}`, status: 'committed', requestSnapshot: { packageId: data.packageId, classId: data.classId || '' }, resultSnapshot: { orderId: `order_${id}`, status: data.classId ? 'synchronizing_future_lessons' : 'awaiting_class_assignment', sync: { futureLessonCount: data.classId ? 2 : 0 } } }
      store.enrollments.unshift(result)
      return clone(result.resultSnapshot)
    },
    async previewEnrollmentSync(_token, orderId) {
      return { previewHash: `preview-${orderId}`, lessons: [{ lessonId: 'lesson_1', title: '合唱排练', startAt: '2026-08-08T10:00:00.000Z' }] }
    },
    async confirmEnrollmentSync(_token, orderId, previewHash, lessonIds) { return { orderId, previewHash, lessonIds, status: 'completed' } },
    async setAttendance(_token, sessionId, sessionStudentId, attendanceStatus) { updateRecord(store.sessionStudents, sessionStudentId, { attendanceStatus }); return { sessionId, sessionStudentId, attendanceStatus } },
    async markAllPresent(_token, sessionId) { store.sessionStudents.filter((item) => item.sessionId === sessionId).forEach((item) => { item.attendanceStatus = 'present' }); return { sessionId, status: 'attendance_confirmed' } },
    async setActualTeacher(_token, sessionId, sessionTeacherId, actualStatus) { updateRecord(store.sessionTeachers, sessionTeacherId, { actualStatus }); return { sessionId, sessionTeacherId, actualStatus } },
    async previewSettlement(_token, sessionId) {
      const students = store.sessionStudents.filter((item) => item.sessionId === sessionId).map((item) => ({ ...item, sessionStudentId: item.id, studentId: String(item.studentId || ''), attendanceStatus: String(item.attendanceStatus || ''), action: item.creditStatus === 'reserved' ? 'consume' : 'exception', quantity: 1, exception: item.creditStatus === 'reserved' ? null : '课时状态尚未准备完成', allocations: [{ allocationId: 'allocation_1', batchId: 'batch_1', quantity: 1, status: 'reserved', effectiveExpiresAt: '2027-01-31T00:00:00.000Z' }] }))
      const teachers = store.sessionTeachers.filter((item) => item.sessionId === sessionId).map((item) => ({ ...item, sessionTeacherId: item.id, teacherId: String(item.teacherId || ''), role: String(item.role || ''), action: 'earn', quantity: 1 }))
      return { sessionId, sessionStatus: 'completed', canSettle: students.every((item) => !item.exception), students, teachers }
    },
    async publishLesson(_token, sessionId, classIds, teacherOverrides = []) { updateRecord(store.lessons, sessionId, { status: 'scheduled' }); return { sessionId, classIds, teacherOverrides, status: 'scheduled' } },
    async rescheduleLesson(_token, sessionId, newStartAt, newEndAt, reason) { updateRecord(store.lessons, sessionId, { startAt: newStartAt, endAt: newEndAt }); return { sessionId, newStartAt, newEndAt, reason } },
    async settleLesson(_token, sessionId) { updateRecord(store.lessons, sessionId, { status: 'settled' }); return { sessionId, status: 'settled' } },
    async reverseSettlement(_token, sessionId, reason) { updateRecord(store.lessons, sessionId, { status: 'correction_pending' }); return { sessionId, reason, status: 'correction_pending' } },
    async confirmTeacherCredit(_token, teacherCreditEventId, reason) {
      const event = requireRecord(store.teacherEvents, teacherCreditEventId)
      if (event.status !== 'pending') throw new Error('教师工作量已处理')
      event.status = 'confirmed'
      event.reason = reason
      return { confirmationEventId: `confirmation_${teacherCreditEventId}`, earningEventId: teacherCreditEventId, quantity: Number(event.quantityDelta || 0), sessionTeacherId: String(event.sessionTeacherId || ''), teacherId: String(event.teacherId || '') }
    },
    async setClassMembership(_token, classId, studentId, status) {
      const current = store.classStudents.find((item) => item.classId === classId && item.studentId === studentId)
      if (current) current.status = status
      else store.classStudents.push({ id: `class_student_${store.classStudents.length + 1}`, classId, studentId, status, effectiveFrom: new Date().toISOString() })
      return { classId, studentId, status }
    },
    async transferClassStudent(_token, classId, studentId, targetClassId) {
      const current = store.classStudents.find((item) => item.classId === classId && item.studentId === studentId)
      if (current) current.classId = targetClassId
      return { classId, studentId, targetClassId, status: 'transferred' }
    },
    async setClassTeacher(_token, classId, teacherId, role, status) {
      const current = store.classTeachers.find((item) => item.classId === classId && item.teacherId === teacherId && item.role === role)
      if (current) current.status = status
      else store.classTeachers.push({ id: `class_teacher_${store.classTeachers.length + 1}`, classId, teacherId, role, status, effectiveFrom: new Date().toISOString() })
      return { classId, teacherId, role, status }
    },
  }
}

function createMockStore(): Record<CourseResourceKey, CourseRecord[]> {
  return {
    courseSpecs: [{ id: 'course_1', code: 'VOCAL-GROUP', name: '综合声乐班', deliveryMode: 'group', durationMinutes: 60, teacherTier: 'standard', defaultCreditTypeId: 'credit_voice', status: 'active' }],
    packages: [{ id: 'package_1', code: 'VOCAL-10', name: '综合声乐 10 课时', description: '一期声乐课程', saleChannel: 'admin', activationMode: 'FIRST_COMPLETED_SESSION', activationDeadlineDays: 30, validityDurationDays: 180, expiryPolicy: 'FIXED_DURATION', status: 'active' }],
    grantLines: [{ id: 'grant_1', packageId: 'package_1', creditTypeId: 'credit_voice', quantity: 10 }],
    priceVersions: [{ id: 'price_1', packageId: 'package_1', currency: 'CNY', listAmount: 3000, saleAmount: 2800, version: 1, status: 'active' }],
    conversionRules: [{ id: 'conversion_1', sourceCreditTypeId: 'credit_universal', targetCreditTypeId: 'credit_voice', sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000, expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0, activationDeadlineDays: 0, reversible: false, referenceValueLimit: 1, validFrom: '2026-08-01T00:00:00.000Z', validTo: '', version: 1, status: 'draft' }],
    enrollments: [{ id: 'enrollment_1', operationNo: 'ENR-001', studentId: 'student_1', sourceId: 'order_1', status: 'committed', requestSnapshot: { packageId: 'package_1', classId: 'class_1' }, resultSnapshot: { orderId: 'order_1', status: 'synchronizing_future_lessons', sync: { futureLessonCount: 2 } } }],
    classes: [{ id: 'class_1', code: 'GROUP-A', name: '周六综合声乐班', courseSpecId: 'course_1', defaultCreditTypeId: 'credit_voice', termStart: '2026-08-01', termEnd: '2027-01-31', capacity: 12, location: '一号教室', status: 'active' }],
    classStudents: [{ id: 'class_student_1', classId: 'class_1', studentId: 'student_1', status: 'active', effectiveFrom: '2026-08-01' }],
    classTeachers: [{ id: 'class_teacher_1', classId: 'class_1', teacherId: 'teacher_1', role: 'lead', status: 'active' }],
    lessons: [{ id: 'lesson_1', code: 'LESSON-001', title: '合唱排练', startAt: '2026-08-08T10:00:00.000Z', endAt: '2026-08-08T11:00:00.000Z', location: '一号教室', requiredCreditTypeId: 'credit_voice', requiredQuantity: 1, rosterVersion: 1, version: 1, status: 'scheduled' }],
    assignedLessons: [],
    sessionClasses: [{ id: 'session_class_1', sessionId: 'lesson_1', classId: 'class_1' }],
    sessionStudents: [{ id: 'session_student_1', sessionId: 'lesson_1', studentId: 'student_1', attendanceStatus: 'scheduled', creditStatus: 'reserved', version: 1 }],
    sessionTeachers: [{ id: 'session_teacher_1', sessionId: 'lesson_1', teacherId: 'teacher_1', role: 'lead', actualStatus: 'pending', creditStatus: 'pending' }],
    accounts: [{ id: 'student_1', studentId: 'student_1', batchCount: 1, availableQuantity: 8, frozenQuantity: 1, consumedQuantity: 1, expiredQuantity: 0, unactivatedQuantity: 0 } satisfies CourseAccount],
    teacherEvents: [{ id: 'teacher_event_1', sessionTeacherId: 'session_teacher_1', teacherId: 'teacher_1', eventType: 'EARN', quantityDelta: 1, status: 'pending' }],
    settlementExceptions: [],
    reconciliationExceptions: [],
    auditLogs: [{ id: 'audit_1', actorId: 'admin_1', actorRole: 'admin', action: 'course_operations.enrollment.create', resourceType: 'enrollment', resourceId: 'order_1', outcome: 'success', created: '2026-08-01T10:00:00.000Z' }],
  }
}

function assignedLessons(store: Record<CourseResourceKey, CourseRecord[]>): CourseRecord[] {
  return store.lessons.map((lesson) => ({
    ...lesson,
    sessionId: lesson.id,
    students: store.sessionStudents.filter((record) => record.sessionId === lesson.id),
    teachers: store.sessionTeachers.filter((record) => record.sessionId === lesson.id),
  }))
}

function writableStoreKey(resource: CourseWritableResource): CourseResourceKey {
  return ({ 'course-specs': 'courseSpecs', packages: 'packages', 'grant-lines': 'grantLines', 'price-versions': 'priceVersions', 'conversion-rules': 'conversionRules', classes: 'classes', lessons: 'lessons' } as const)[resource]
}

function matchesQuery(record: CourseRecord, query: CourseQuery) {
  return Object.entries(query).every(([key, value]) => ['page', 'perPage'].includes(key) || value === undefined || value === '' || String(record[key] ?? '') === String(value))
}

function page<T>(items: T[], requestedPage = 1, requestedPerPage = 20): CoursePage<T> {
  const pageNumber = Math.max(1, Number(requestedPage) || 1)
  const perPage = Math.max(1, Number(requestedPerPage) || 20)
  return { page: pageNumber, perPage, totalItems: items.length, totalPages: items.length ? Math.ceil(items.length / perPage) : 0, items: clone(items.slice((pageNumber - 1) * perPage, pageNumber * perPage)) }
}

function requireRecord(records: CourseRecord[], id: string) {
  const record = records.find((item) => item.id === id)
  if (!record) throw new Error('课程运营记录不存在')
  return record
}

function updateRecord(records: CourseRecord[], id: string, changes: CourseResourceInput) {
  Object.assign(requireRecord(records, id), changes)
}

function clone<T>(value: T): T { return structuredClone(value) }
function idempotencyKey(scope: string) { return `${scope}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}` }
