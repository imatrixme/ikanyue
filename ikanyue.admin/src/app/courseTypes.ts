export type CourseCapability =
  | 'course_credit.finance'
  | 'course_credit.academic'
  | 'course_credit.settlement'
  | 'course_credit.teacher'
  | 'course_credit.audit'

export type CourseResourceKey =
  | 'courseSpecs'
  | 'packages'
  | 'grantLines'
  | 'priceVersions'
  | 'conversionRules'
  | 'enrollments'
  | 'classes'
  | 'classStudents'
  | 'classTeachers'
  | 'lessons'
  | 'assignedLessons'
  | 'sessionClasses'
  | 'sessionStudents'
  | 'sessionTeachers'
  | 'accounts'
  | 'teacherEvents'
  | 'settlementExceptions'
  | 'reconciliationExceptions'
  | 'auditLogs'

export type CourseWritableResource = 'course-specs' | 'packages' | 'grant-lines' | 'price-versions' | 'conversion-rules' | 'classes' | 'lessons'

export interface CoursePage<T = CourseRecord> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export interface CourseRecord {
  id: string
  status?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export interface CourseSpec extends CourseRecord {
  code: string
  name: string
  deliveryMode: string
  durationMinutes: number
  teacherTier: string
}

export interface CoursePackage extends CourseRecord {
  code: string
  name: string
  description: string
  saleChannel: string
  activationMode: string
  activationDeadlineDays: number
  validityDurationDays: number
  expiryPolicy: string
}

export interface PriceVersion extends CourseRecord {
  packageId: string
  currency: string
  listAmount: number
  saleAmount: number
  validFrom: string
  validTo: string
  version: number
}

export interface TeachingClass extends CourseRecord {
  code: string
  name: string
  courseSpecId: string
  defaultCreditTypeId: string
  termStart: string
  termEnd: string
  capacity: number
  location: string
}

export interface Lesson extends CourseRecord {
  code: string
  title: string
  startAt: string
  endAt: string
  location: string
  requiredCreditTypeId: string
  requiredQuantity: number
  rosterVersion: number
  version: number
  students?: CourseRecord[]
  teachers?: CourseRecord[]
}

export interface EnrollmentOperation extends CourseRecord {
  operationNo: string
  studentId: string
  sourceId: string
  actorId: string
  actorRole: string
  requestSnapshot: {
    packageId?: string
    classId?: string
  }
  resultSnapshot: {
    orderId?: string
    status?: string
    courseHours?: number
    sync?: { futureLessonCount?: number; warningCount?: number }
  }
}

export interface CourseAccount extends CourseRecord {
  studentId: string
  batchCount: number
  availableQuantity: number
  frozenQuantity: number
  consumedQuantity: number
  expiredQuantity: number
  unactivatedQuantity: number
  batches?: CourseRecord[]
  events?: CourseRecord[]
}

export interface CourseQuery {
  page?: number
  perPage?: number
  status?: string
  studentId?: string
  teacherId?: string
  classId?: string
  sessionId?: string
  sourceId?: string
  resourceType?: string
  resourceId?: string
  outcome?: string
}

export interface CourseCommandResult {
  operationId?: string
  traceId?: string
  replayed?: boolean
  [key: string]: unknown
}

export interface TeacherCreditConfirmation extends CourseCommandResult {
  confirmationEventId: string
  earningEventId: string
  quantity: number
  sessionTeacherId: string
  teacherId: string
}

export interface EnrollmentInput {
  studentId: string
  packageId: string
  priceVersionId: string
  classId?: string
  paidAmount?: number
  channel?: 'admin' | 'offline'
  paymentReference?: string
  reason?: string
}

export interface RosterSyncPreview extends CourseCommandResult {
  previewHash: string
  lessons: Array<{ lessonId: string; title?: string; startAt?: string }>
}

export interface SettlementPreview extends CourseCommandResult {
  sessionId: string
  sessionStatus?: string
  canSettle?: boolean
  students?: Array<CourseRecord & {
    sessionStudentId: string
    studentId: string
    attendanceStatus: string
    action: string
    quantity: number
    exception?: string | null
    allocations?: Array<{ allocationId?: string; batchId: string; quantity: number; status?: string; effectiveExpiresAt?: string | null }>
  }>
  teachers?: Array<CourseRecord & {
    sessionTeacherId: string
    teacherId: string
    role: string
    action: string
    quantity: number
  }>
}

export interface CourseResourceInput {
  [key: string]: unknown
}
