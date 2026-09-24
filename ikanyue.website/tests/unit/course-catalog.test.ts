import { describe, expect, it } from 'vitest'
import {
  normalizePublicCourse,
  normalizePublicCourseCatalog,
  normalizePublicCourseDetail,
  normalizePublicPackage,
} from '../../server/utils/course-catalog'
import {
  formatPackagePrice,
  activationLabel,
  deliveryLabel,
  formatPackageValidity,
  grantQuantity,
  packageHandoffHref,
} from '~/utils/course-catalog'
import type { PublicCoursePackage } from '~/types/content'
import { academyTime } from '~/utils/academy-time'

describe('public course catalog boundary', () => {
  it('allowlists public course and package fields', () => {
    const catalog = normalizePublicCourseCatalog({
      courses: [{
        code: 'VOCAL-60', name: '成人声乐', deliveryMode: 'one_to_one', durationMinutes: '60',
        teacherTier: 'senior', packageCodes: ['VOCAL-10', null],
        roster: [{ studentId: 'private-student' }], metadata: { internal: true },
      }],
      packages: [packageInput()],
      balances: [{ studentId: 'private-student', quantity: 10 }],
      orders: [{ orderNo: 'private-order' }],
      teacherCredits: [{ teacherId: 'private-teacher' }],
    })

    expect(catalog.courses[0]).toEqual({
      code: 'VOCAL-60', deliveryMode: 'one_to_one', durationMinutes: 60,
      name: '成人声乐', packageCodes: ['VOCAL-10'], teacherTier: 'senior',
    })
    expect(catalog.packages[0].price).toEqual({ currency: 'CNY', listAmount: 3000, saleAmount: 2800 })
    const output = JSON.stringify(catalog)
    expect(output).not.toMatch(/studentId|roster|balance|orderNo|teacherId|teacherCredit|metadata|grantSnapshot/)
  })

  it('normalizes malformed values to stable empty public shapes', () => {
    expect(normalizePublicCourse(null)).toEqual({
      code: '', deliveryMode: '', durationMinutes: 0, name: '', packageCodes: [], teacherTier: '',
    })
    expect(normalizePublicPackage({ purchaseMode: 'other', price: 'bad', validity: [] })).toEqual({
      code: '', description: '', grants: [], name: '',
      price: { currency: '', listAmount: 0, saleAmount: 0 },
      purchaseMode: 'contact',
      validity: {
        activationDeadlineDays: null, activationMode: '', expiryPolicy: '', validityDurationDays: null,
      },
    })
    expect(normalizePublicCourseCatalog(null)).toEqual({ courses: [], packages: [] })
  })

  it('normalizes detail grants without retaining relation ids', () => {
    const detail = normalizePublicCourseDetail({
      code: 'VOCAL-60', packages: [packageInput()], privateAccount: { balance: 100 },
    })
    expect(detail.packages[0].grants[0]).toEqual({
      courseCode: 'VOCAL-60', courseName: '成人声乐', creditName: '成人声乐课点',
      quantity: 10, unitLabel: '课时',
    })
    expect(JSON.stringify(detail)).not.toContain('creditTypeId')
  })
})

describe('public package presentation', () => {
  it('formats prices and all validity policies', () => {
    const item = coursePackage()
    expect(formatPackagePrice(item)).toMatch(/2,800/)
    expect(formatPackagePrice({ ...item, price: { ...item.price, currency: '' } })).toMatch(/2,800/)
    expect(formatPackageValidity(item)).toBe('生效后 180 天有效')
    expect(formatPackageValidity({ ...item, validity: { ...item.validity, activationMode: 'GRANT_TIME' } })).toBe('购买后 180 天有效')
    expect(formatPackageValidity({
      ...item, validity: { ...item.validity, expiryPolicy: 'NO_EXPIRY' },
    })).toBe('长期有效')
    expect(formatPackageValidity({
      ...item, validity: { ...item.validity, expiryPolicy: 'TERM_END' },
    })).toBe('随学期结束')
    expect(formatPackageValidity({
      ...item, validity: { ...item.validity, validityDurationDays: null },
    })).toBe('有效期以确认单为准')
  })

  it('uses configured mini-program handoff and safe contact fallback', () => {
    const item = coursePackage()
    expect(packageHandoffHref(item)).toBe('/contact?package=VOCAL-10')
    const mini = { ...item, purchaseMode: 'mini_program' as const }
    expect(packageHandoffHref(mini, 'weixin://dl/business/?t={packageCode}'))
      .toBe('weixin://dl/business/?t=VOCAL-10')
    expect(packageHandoffHref(mini, 'https://mini.example.com/open'))
      .toBe('https://mini.example.com/open?package=VOCAL-10')
    expect(packageHandoffHref(mini, 'https://mini.example.com/open?scene=web'))
      .toBe('https://mini.example.com/open?scene=web&package=VOCAL-10')
  })
})

describe('visitor-facing catalog labels', () => {
  it('never shows raw catalog enums', () => {
    expect(deliveryLabel('one_to_one')).toBe('一对一')
    expect(deliveryLabel('unknown_mode')).toBe('面授课程')
    expect(activationLabel('GRANT_TIME')).toBe('购买后立即生效')
    expect(activationLabel('SOMETHING')).toBe('以确认单为准')
    const grant = coursePackage().grants[0]
    expect(grantQuantity({ ...grant, unitLabel: 'lesson' })).toBe('10 节')
    expect(grantQuantity({ ...grant, unitLabel: 'mystery_unit' })).toBe('10 节')
    expect(grantQuantity(grant)).toBe('10 课时')
  })

  it('formats activity times in the academy time zone', () => {
    const start = new Date('2026-09-07T02:00:00.000Z')
    expect(academyTime(start, { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('10:00')
    expect(academyTime(start, { day: '2-digit' }).replace(/\D/g, '')).toBe('07')
  })
})

function packageInput() {
  return {
    code: 'VOCAL-10', name: '成人声乐十节课包', description: '十节系统训练',
    grants: [{
      courseCode: 'VOCAL-60', courseName: '成人声乐', creditName: '成人声乐课点',
      quantity: '10', unitLabel: '课时', creditTypeId: 'private-credit-id',
    }],
    price: { currency: 'CNY', listAmount: '3000', saleAmount: 2800, grantSnapshot: { private: true } },
    purchaseMode: 'mini_program',
    validity: {
      activationDeadlineDays: '30', activationMode: 'FIRST_CHECK_IN',
      expiryPolicy: 'FIXED_DURATION', validityDurationDays: 180,
    },
    orderNo: 'private-order',
  }
}

function coursePackage(): PublicCoursePackage {
  return normalizePublicPackage(packageInput())
}
