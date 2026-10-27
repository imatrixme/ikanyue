import type {
  PublicCourseCatalog,
  PublicCourseDetail,
  PublicCoursePackage,
  PublicPackageGrant,
} from '../../app/types/content'

export function normalizePublicCourseCatalog(value: unknown): PublicCourseCatalog {
  const source = record(value)
  return {
    courses: array(source.courses).map(normalizePublicCourse),
    packages: array(source.packages).map(normalizePublicPackage),
  }
}

export function normalizePublicCourseDetail(value: unknown): PublicCourseDetail {
  const source = record(value)
  return {
    ...normalizePublicCourse(source),
    packages: array(source.packages).map(normalizePublicPackage),
  }
}

export function normalizePublicCourse(value: unknown) {
  const source = record(value)
  return {
    code: text(source.code),
    deliveryMode: text(source.deliveryMode),
    durationMinutes: number(source.durationMinutes),
    name: text(source.name),
    packageCodes: array(source.packageCodes).map(text).filter(Boolean),
    teacherTier: text(source.teacherTier),
  }
}

export function normalizePublicPackage(value: unknown): PublicCoursePackage {
  const source = record(value)
  const price = record(source.price)
  const validity = record(source.validity)
  return {
    code: text(source.code),
    description: text(source.description),
    grants: array(source.grants).map(normalizeGrant),
    name: text(source.name),
    price: {
      currency: text(price.currency),
      listAmount: number(price.listAmount),
      saleAmount: number(price.saleAmount),
    },
    purchaseMode: source.purchaseMode === 'mini_program' ? 'mini_program' : 'contact',
    validity: {
      activationDeadlineDays: nullableNumber(validity.activationDeadlineDays),
      activationMode: text(validity.activationMode),
      expiryPolicy: text(validity.expiryPolicy),
      validityDurationDays: nullableNumber(validity.validityDurationDays),
    },
  }
}

function normalizeGrant(value: unknown): PublicPackageGrant {
  const source = record(value)
  return {
    courseCode: nullableText(source.courseCode),
    courseName: nullableText(source.courseName),
    creditName: text(source.creditName),
    quantity: number(source.quantity),
    unitLabel: text(source.unitLabel),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function number(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : number(value)
}
