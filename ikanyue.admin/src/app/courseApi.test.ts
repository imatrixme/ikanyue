import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, createOpsApi } from './api'
import { viewFromPath, viewPaths } from './navigation'

describe('course operations api', () => {
  it('supports the complete mock operations workflow', async () => {
    const api = createMockOpsApi()
    const token = 'token'
    expect((await api.listCourseResource(token, 'courseSpecs')).items[0].name).toBe('综合声乐班')
    expect((await api.listCourseResource(token, 'conversionRules')).items[0]).toMatchObject({ sourceQuantity: 100, targetQuantity: 1 })
    expect((await api.listCourseResource(token, 'assignedLessons')).items[0]).toMatchObject({
      id: 'lesson_1', students: [{ studentId: 'student_1' }], teachers: [{ teacherId: 'teacher_1' }],
    })
    expect((await api.listCourseResource(token, 'classes', { status: 'active', page: 2, perPage: 1 })).items).toHaveLength(0)
    expect(await api.listCourseResource(token, 'classes', { status: undefined, classId: '' })).toMatchObject({ totalItems: 1 })
    expect(await api.listCourseResource(token, 'classes', { status: 'missing', page: 0, perPage: 0 })).toMatchObject({ page: 1, perPage: 20, totalItems: 0, totalPages: 0 })
    expect((await api.getCourseResource(token, 'accounts', 'student_1')).studentId).toBe('student_1')
    await expect(api.getCourseResource(token, 'classes', 'missing')).rejects.toThrow('课程运营记录不存在')

    const created = await api.createCourseResource(token, 'course-specs', { code: 'VOCAL-1', name: '一对一声乐', status: 'draft' })
    await api.updateCourseResource(token, 'course-specs', created.id, { name: '精品一对一声乐' })
    await api.setCourseResourceStatus(token, 'course-specs', created.id, 'active')
    expect(await api.getCourseResource(token, 'courseSpecs', created.id)).toMatchObject({ name: '精品一对一声乐', status: 'active' })
    await expect(api.updateCourseResource(token, 'course-specs', 'missing', { name: '缺失' })).rejects.toThrow('课程运营记录不存在')
    await expect(api.setCourseResourceStatus(token, 'course-specs', 'missing', 'active')).rejects.toThrow('课程运营记录不存在')

    const enrollment = await api.createEnrollment(token, { studentId: 'student_1', packageId: 'package_1', priceVersionId: 'price_1', classId: 'class_1' })
    expect(enrollment.status).toBe('synchronizing_future_lessons')
    expect(await api.createEnrollment(token, { studentId: 'student_2', packageId: 'package_1', priceVersionId: 'price_1' })).toMatchObject({ status: 'awaiting_class_assignment' })
    const preview = await api.previewEnrollmentSync(token, String(enrollment.orderId))
    expect(await api.confirmEnrollmentSync(token, String(enrollment.orderId), preview.previewHash, ['lesson_1'])).toMatchObject({ status: 'completed' })

    expect(await api.setAttendance(token, 'lesson_1', 'session_student_1', 'late')).toMatchObject({ attendanceStatus: 'late' })
    expect(await api.markAllPresent(token, 'lesson_1')).toMatchObject({ status: 'attendance_confirmed' })
    expect(await api.setActualTeacher(token, 'lesson_1', 'session_teacher_1', 'confirmed')).toMatchObject({ actualStatus: 'confirmed' })
    expect((await api.previewSettlement(token, 'lesson_1')).students).toHaveLength(1)
    expect(await api.publishLesson(token, 'lesson_1', ['class_1'])).toMatchObject({ status: 'scheduled' })
    expect(await api.rescheduleLesson(token, 'lesson_1', '2026-08-09T10:00:00.000Z', '2026-08-09T11:00:00.000Z', '调整')).toMatchObject({ reason: '调整' })
    expect(await api.settleLesson(token, 'lesson_1')).toMatchObject({ status: 'settled' })
    expect(await api.reverseSettlement(token, 'lesson_1', '更正')).toMatchObject({ status: 'correction_pending' })
    expect(await api.confirmTeacherCredit(token, 'teacher_event_1', '教务确认课堂工作量')).toMatchObject({ earningEventId: 'teacher_event_1', quantity: 1 })
    await expect(api.confirmTeacherCredit(token, 'teacher_event_1', '重复确认')).rejects.toThrow('教师工作量已处理')
    expect(await api.setClassMembership(token, 'class_1', 'student_1', 'active')).toMatchObject({ status: 'active' })
    expect(await api.setClassMembership(token, 'class_1', 'student_2', 'active')).toMatchObject({ status: 'active' })
    expect(await api.transferClassStudent(token, 'class_1', 'student_1', 'class_2')).toMatchObject({ status: 'transferred' })
    expect(await api.transferClassStudent(token, 'class_1', 'missing', 'class_2')).toMatchObject({ status: 'transferred' })
    expect(await api.setClassTeacher(token, 'class_1', 'teacher_1', 'lead', 'active')).toMatchObject({ role: 'lead' })
    expect(await api.setClassTeacher(token, 'class_1', 'teacher_2', 'assistant', 'active')).toMatchObject({ role: 'assistant' })
  })

  it('maps every HTTP operation to an authenticated Hono route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10000, data: {} }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = createOpsApi({ baseUrl: '/ops', mock: false })
    const calls = [
      api.listCourseResource('token', 'lessons', { page: 1, perPage: 20, status: 'scheduled' }),
      api.getCourseResource('token', 'accounts', 'student 1'),
      api.createCourseResource('token', 'course-specs', { name: '课程' }),
      api.updateCourseResource('token', 'packages', 'package 1', { name: '课包' }),
      api.setCourseResourceStatus('token', 'price-versions', 'price 1', 'active', '启用'),
      api.setCourseResourceStatus('token', 'conversion-rules', 'rule 1', 'inactive', '停用'),
      api.createEnrollment('token', { studentId: 'student_1', packageId: 'package_1', priceVersionId: 'price_1' }),
      api.previewEnrollmentSync('token', 'order 1'),
      api.confirmEnrollmentSync('token', 'order 1', 'hash', ['lesson_1']),
      api.setAttendance('token', 'lesson 1', 'student row', 'present'),
      api.markAllPresent('token', 'lesson 1'),
      api.setActualTeacher('token', 'lesson 1', 'teacher row', 'confirmed'),
      api.previewSettlement('token', 'lesson 1'),
      api.publishLesson('token', 'lesson 1', ['class_1']),
      api.rescheduleLesson('token', 'lesson 1', 'start', 'end', 'reason'),
      api.settleLesson('token', 'lesson 1'),
      api.reverseSettlement('token', 'lesson 1', 'reason'),
      api.confirmTeacherCredit('token', 'teacher event 1', '教务确认'),
      api.setClassMembership('token', 'class 1', 'student 1', 'active'),
      api.transferClassStudent('token', 'class 1', 'student 1', 'class 2'),
      api.setClassTeacher('token', 'class 1', 'teacher 1', 'lead', 'active'),
    ]
    await Promise.all(calls)
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/ops/course-credits/sessions?page=1&perPage=20&status=scheduled')
    expect(urls).toContain('/ops/course-credits/accounts/student%201')
    expect(urls).toContain('/ops/course-operations/conversion-rules/rule%201/status')
    expect(urls).toContain('/ops/course-operations/enrollments/order%201/sync')
    expect(urls).toContain('/ops/course-credits/teacher-events/teacher%20event%201/confirm')
    expect(urls).toContain('/ops/course-credits/classes/class%201/students/student%201/transfer')
    const commands = fetchMock.mock.calls.map(([, options]) => options).filter((options) => options?.method === 'POST')
    expect(commands.every((options) => options.headers.authorization === 'Bearer token')).toBe(true)
    expect(commands.every((options) => options.headers['Idempotency-Key'])).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls.at(-2)?.[1].body)).toMatchObject({ toClassId: 'class 2' })
  })

  it('maps stable route paths and unknown paths to dashboard', () => {
    expect(viewPaths.enrollments).toBe('/enrollments')
    expect(viewPaths.appointments).toBe('/appointments')
    expect(viewPaths.calendar).toBe('/calendar')
    expect(viewPaths.migration).toBe('/migration')
    expect(viewFromPath('/calendar')).toBe('calendar')
    expect(viewFromPath('/appointments')).toBe('appointments')
    expect(viewFromPath('/migration')).toBe('migration')
    expect(viewFromPath('/lessons/lesson_1')).toBe('lessons')
    expect(viewFromPath('/not-found')).toBe('dashboard')
  })
})
