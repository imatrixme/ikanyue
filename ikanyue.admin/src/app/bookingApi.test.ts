import { describe, expect, it, vi } from 'vitest'

import { createHttpBookingOpsApi, createMockBookingOpsApi } from './bookingApi'

describe('booking operations api', () => {
  it('runs the complete mock appointment and dashboard workflow', async () => {
    const api = createMockBookingOpsApi()
    expect((await api.getBookingDashboard('token')).pendingCount).toBe(1)
    expect((await api.getBookingReferenceData('token')).teachers[0].name).toBe('林老师')
    expect((await api.listBookingAppointments('token')).totalItems).toBe(3)
    expect((await api.listBookingAppointments('token', { status: 'pending,confirmed' })).totalItems).toBe(2)
    expect((await api.listBookingAppointments('token', { teacherId: 'teacher_1', studentId: 'student_1', courseSpecId: 'course_1' })).items[0].appointmentId).toBe('appointment_1')
    expect((await api.listBookingAppointments('token', { from: '2026-08-04T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z' })).items[0].appointmentId).toBe('appointment_2')
    expect((await api.listBookingAppointments('token', { page: 2, perPage: 1 })).items).toHaveLength(1)
    expect((await api.listBookingAppointments('token', { page: 0, perPage: 0 })).page).toBe(1)

    const detail = await api.getBookingAppointment('token', 'appointment_1')
    expect(detail.events[0].eventType).toBe('requested')
    expect(detail.claims).toHaveLength(0)
    await expect(api.getBookingAppointment('token', 'missing')).rejects.toThrow('预约不存在')
    expect(await api.confirmBookingAppointment('token', 'appointment_1')).toMatchObject({ status: 'confirmed' })
    expect((await api.getBookingAppointment('token', 'appointment_1')).events.at(-1)?.actorRole).toBe('admin')
    await expect(api.declineBookingAppointment('token', 'appointment_1', '已处理')).rejects.toThrow('预约已被处理')
    const declineApi = createMockBookingOpsApi()
    expect(await declineApi.declineBookingAppointment('token', 'appointment_1', '教师时间冲突')).toMatchObject({ status: 'declined' })
    expect((await declineApi.getBookingAppointment('token', 'appointment_1')).responseReason).toBe('教师时间冲突')
    expect(await api.cancelBookingAppointment('token', 'appointment_2', '教务取消')).toMatchObject({ status: 'cancelled' })
    expect((await api.getBookingAppointment('token', 'appointment_2')).responseReason).toBe('教务取消')
    expect(await api.rescheduleBookingAppointment('token', 'appointment_1', '2026-08-06T01:00:00.000Z', '2026-08-06T02:00:00.000Z', '改期')).toMatchObject({ status: 'rescheduled' })
  })

  it('runs policy, offering, availability, conflict, and backfill mock workflows', async () => {
    const api = createMockBookingOpsApi()
    const token = 'token'
    expect((await api.listBookingPolicies(token, { status: 'active' })).items).toHaveLength(1)
    await api.createBookingPolicy(token, policyInput('active'))
    expect((await api.listBookingPolicies(token, { status: 'inactive' })).items).toHaveLength(1)
    await api.createBookingPolicy(token, { ...policyInput('draft'), code: 'draft-policy' })
    expect((await api.listBookingPolicies(token, { status: 'draft' })).items).toHaveLength(1)

    expect((await api.listBookingOfferings(token, { status: 'active', teacherId: 'teacher_1', courseSpecId: 'course_1' })).items).toHaveLength(1)
    const created = await api.saveBookingOffering(token, null, offeringInput('teacher_2'))
    expect(created.offeringId).toBe('offering_2')
    await api.saveBookingOffering(token, String(created.offeringId), { ...offeringInput('teacher_2'), status: 'active' })
    await expect(api.saveBookingOffering(token, 'missing', offeringInput('teacher_1'))).rejects.toThrow('预约配置不存在')
    await expect(api.saveBookingOffering(token, null, offeringInput('missing'))).rejects.toThrow('教师或课程不存在')

    expect((await api.getBookingAvailability(token, { offeringId: 'offering_1' })).rules).toHaveLength(1)
    await api.saveBookingWeeklyAvailability(token, 'offering_1', [{ weekday: 2, startMinute: 840, endMinute: 900 }])
    expect((await api.getBookingAvailability(token, { offeringId: 'offering_1' })).rules[0].weekday).toBe(2)
    await api.saveBookingWeeklyAvailability(token, 'offering_1', [])
    expect((await api.getBookingAvailability(token, { offeringId: 'offering_1' })).rules).toHaveLength(0)
    const override = await api.createBookingAvailabilityOverride(token, 'offering_1', { type: 'available', startAt: '2026-08-20T01:00:00.000Z', endAt: '2026-08-20T02:00:00.000Z', reason: '加开' })
    expect(await api.cancelBookingAvailabilityOverride(token, String(override.overrideId))).toMatchObject({ status: 'cancelled' })
    await expect(api.cancelBookingAvailabilityOverride(token, 'missing')).rejects.toThrow('临时时间不存在')

    const preview = await api.previewBookingBackfill(token, '2026-08-01T00:00:00.000Z')
    expect(preview.ready).toBe(false)
    expect((await api.listBookingConflicts(token, { status: 'open' })).items).toHaveLength(1)
    expect(await api.resolveBookingConflict(token, 'conflict_1', '已完成线下调整')).toMatchObject({ status: 'resolved' })
    await expect(api.resolveBookingConflict(token, 'missing', '已处理')).rejects.toThrow('冲突不存在')
    expect((await api.previewBookingBackfill(token, '2026-08-01T00:00:00.000Z')).ready).toBe(true)
    expect(await api.applyBookingBackfill(token, '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toMatchObject({ scannedCount: 4, conflictCount: 0 })
  })

  it('maps every HTTP operation to authenticated course-booking routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10000, data: {} }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpBookingOpsApi('/ops')
    await Promise.all([
      api.getBookingDashboard('token'),
      api.getBookingReferenceData('token'),
      api.listBookingAppointments('token', { page: 2, status: 'pending', teacherId: 'teacher 1' }),
      api.getBookingAppointment('token', 'appointment 1'),
      api.confirmBookingAppointment('token', 'appointment 1'),
      api.declineBookingAppointment('token', 'appointment 1', '拒绝'),
      api.cancelBookingAppointment('token', 'appointment 1', '取消'),
      api.rescheduleBookingAppointment('token', 'appointment 1', 'start', 'end', '调整'),
      api.listBookingPolicies('token', { status: 'active' }),
      api.createBookingPolicy('token', policyInput('active')),
      api.listBookingOfferings('token', { courseSpecId: 'course 1' }),
      api.saveBookingOffering('token', null, offeringInput('teacher_1')),
      api.saveBookingOffering('token', 'offering 1', offeringInput('teacher_1')),
      api.getBookingAvailability('token', { offeringId: 'offering 1' }),
      api.saveBookingWeeklyAvailability('token', 'offering 1', []),
      api.createBookingAvailabilityOverride('token', 'offering 1', { type: 'unavailable', startAt: 'start', endAt: 'end', reason: '停用' }),
      api.cancelBookingAvailabilityOverride('token', 'override 1'),
      api.listBookingConflicts('token', { status: 'open' }),
      api.resolveBookingConflict('token', 'conflict 1', '已处理'),
      api.previewBookingBackfill('token', 'from', 'to'),
      api.applyBookingBackfill('token', 'from'),
    ])
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/ops/course-bookings/reference-data')
    expect(urls).toContain('/ops/course-bookings/appointments?page=2&status=pending&teacherId=teacher+1')
    expect(urls).toContain('/ops/course-bookings/appointments/appointment%201')
    expect(urls).toContain('/ops/course-bookings/appointments/appointment%201/confirm')
    expect(urls).toContain('/ops/course-bookings/appointments/appointment%201/decline')
    const confirmCall = fetchMock.mock.calls.find(([url]) => url === '/ops/course-bookings/appointments/appointment%201/confirm')
    expect(confirmCall?.[1].body).toBe('{}')
    expect(urls).toContain('/ops/course-bookings/offerings/offering%201/availability')
    expect(urls).toContain('/ops/course-bookings/backfill/preview?from=from&to=to')
    const commands = fetchMock.mock.calls.map(([, options]) => options).filter((options) => options?.method && options.method !== 'GET')
    expect(commands.every((options) => options.headers.authorization === 'Bearer token')).toBe(true)
    expect(commands.every((options) => options.headers['Idempotency-Key'])).toBe(true)
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(true)
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true)
  })
})

function policyInput(status: 'draft' | 'active' | 'inactive') {
  return {
    code: 'default', name: '预约策略', timezone: 'Asia/Shanghai',
    defaultWindows: [{ startMinute: 540, endMinute: 660 }], slotStepMinutes: 30,
    claimGranularityMinutes: 15, minLeadMinutes: 720, maxAdvanceDays: 30,
    responseTtlMinutes: 1440, responseCutoffMinutes: 360, cancellationCutoffMinutes: 720,
    effectiveFrom: '2026-08-01T00:00:00.000Z', status,
  }
}

function offeringInput(teacherId: string) {
  return { teacherId, courseSpecId: 'course_1', creditTypeId: 'credit_1', policyId: 'policy_1', location: '琴房', status: 'draft' as const }
}
