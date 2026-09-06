import { describe, expect, it } from 'vitest'

import {
  activationModeLabel,
  courseFieldValue,
  creditEventLabel,
  creditStatusLabel,
  deliveryModeLabel,
  expiryPolicyLabel,
  formatMoney,
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
    expect(courseFieldValue('status', 'active')).toBe('启用')
  })

  it('formats operator values without serializing structures into normal views', () => {
    expect(formatMoney(2980, 'CNY')).toContain('2,980')
    expect(safeDisplayValue({ id: 'hidden' })).toBe('请在技术信息中查看')
    expect(technicalValue({ id: 'visible' })).toContain('"id": "visible"')
    expect(safeDisplayValue(true)).toBe('是')
  })
})
