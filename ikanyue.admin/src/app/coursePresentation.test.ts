import { describe, expect, it } from 'vitest'

import {
  activationModeLabel,
  courseFieldValue,
  creditEventLabel,
  creditStatusLabel,
  deliveryModeLabel,
  expiryPolicyLabel,
  formatMoney,
  lessonActions,
  mapById,
  personLabel,
  personOption,
  recordName,
  referenceName,
  roleLabel,
  safeDisplayValue,
  saleChannelLabel,
  shortIdentifier,
  statusLabel,
  technicalValue,
} from './coursePresentation'

describe('course presentation', () => {
  it('uses recognizable names before contact details and identifiers', () => {
    expect(personLabel({ id: 'student_1', realName: '张琳', cellphone: '13800138000' })).toBe('张琳 · 13800138000')
    expect(personOption({ id: 'teacher_1', name: '林老师', cellphone: '13900139000' })).toMatchObject({ value: 'teacher_1', label: '林老师', description: '13900139000' })
    expect(personLabel(undefined, 'student_very_long_identifier')).toContain('未找到人员')
    expect(shortIdentifier('student_very_long_identifier')).toBe('stud...fier')
  })

  it('resolves business objects and exposes explicit unresolved fallbacks', () => {
    const records = mapById([{ id: 'class_1', name: '周六声乐班' }])
    expect(recordName(records.get('class_1'))).toBe('周六声乐班')
    expect(referenceName(records, 'class_1', '班级')).toBe('周六声乐班')
    expect(referenceName(records, 'missing_class', '班级')).toContain('未找到班级')
  })

  it('localizes controlled values and hides unknown raw values from primary copy', () => {
    expect(statusLabel('scheduled')).toBe('待上课')
    expect(roleLabel('lead')).toBe('主教老师')
    expect(deliveryModeLabel('one_to_one')).toBe('一对一')
    expect(activationModeLabel('FIRST_RESERVATION')).toBe('首次预约时生效')
    expect(expiryPolicyLabel('NO_EXPIRY')).toBe('长期有效')
    expect(saleChannelLabel('admin')).toBe('后台销售')
    expect(creditEventLabel('REVERSE')).toBe('业务更正')
    expect(creditStatusLabel('reserved')).toBe('已为本节课预留')
    expect(statusLabel('future_backend_value')).toBe('状态待确认')
    expect(courseFieldValue('durationMinutes', 45)).toBe('45 分钟')
    expect(courseFieldValue('validityDurationDays', 180)).toBe('180 天')
    expect(courseFieldValue('activationDeadlineDays', '')).toBe('-')
    expect(courseFieldValue('status', 'active')).toBe('启用')
  })

  it('offers lesson commands only in states the server accepts', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z')
    const past = '2026-08-08T10:00:00.000Z'
    const future = '2026-08-09T10:00:00.000Z'
    expect(lessonActions({ status: 'scheduled', startAt: future }, now)).toEqual({ attendance: true, reschedule: true, complete: false, cancel: true, settle: false, reverse: false })
    expect(lessonActions({ status: 'scheduled', startAt: past }, now).complete).toBe(true)
    expect(lessonActions({ status: 'scheduled', startAt: future, appointmentId: 'appointment_1' }, now).cancel).toBe(false)
    expect(lessonActions({ status: 'cancelled', startAt: past }, now)).toEqual({ attendance: false, reschedule: false, complete: false, cancel: false, settle: true, reverse: false })
    expect(lessonActions({ status: 'settled', startAt: past }, now)).toMatchObject({ attendance: false, reverse: true })
    expect(lessonActions({ status: 'draft', startAt: past }, now)).toMatchObject({ attendance: false, complete: false, cancel: false })
  })

  it('formats operator values without serializing structures into normal views', () => {
    expect(formatMoney(2980, 'CNY')).toContain('2,980')
    expect(safeDisplayValue({ id: 'hidden' })).toBe('请在技术信息中查看')
    expect(technicalValue({ id: 'visible' })).toContain('"id": "visible"')
    expect(safeDisplayValue(true)).toBe('是')
  })
})
