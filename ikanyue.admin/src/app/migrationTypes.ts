export interface MigrationTarget {
  code: string
  id: string
  name: string
  status: string
}

export interface MigrationInventory {
  availability: Record<string, boolean>
  attendance: Array<{ id: string; sessionId: string; status: string; studentId: string }>
  programs: Array<{ id: string; name: string }>
  sessions: Array<{ endAt: string; id: string; startAt: string; studentId: string; teacherId: string; title: string }>
  studentHours: Array<{ hours: number; id: string; label: string }>
  targets: { classes: MigrationTarget[]; creditTypes: MigrationTarget[]; packages: MigrationTarget[] }
  teacherHours: Array<{ hours: number; id: string; label: string }>
  totals: {
    attendance: number
    programs: number
    sessions: number
    studentHours: number
    students: number
    teacherHours: number
    teachers: number
  }
}

export interface MigrationAllocation {
  activationDeadlineDays?: number | null
  activationMode: 'GRANT_TIME' | 'FIRST_RESERVATION' | 'FIRST_CHECK_IN' | 'FIRST_COMPLETED_SESSION' | 'TERM_START'
  creditTypeId: string
  expiryPolicy: 'FIXED_DURATION' | 'TERM_END' | 'NO_EXPIRY'
  quantity: number
  reason: string
  termEnd?: string | null
  validityDurationDays?: number | null
}

export interface MigrationPlan {
  programs: Array<{ legacyProgramId: string; reason: string; targetId: string; targetType: 'package' | 'class' }>
  sessions: Array<{
    attendanceRecordIds: string[]
    attendees: Array<{ attendanceStatus: string; studentId: string }>
    code?: string
    endAt: string
    legacySessionId: string
    location?: string
    reason: string
    requiredCreditTypeId: string
    requiredQuantity: number
    startAt: string
    teachers: Array<{ actualStatus: string; role: string; teacherId: string }>
    title: string
  }>
  studentHours: Array<{ allocations: MigrationAllocation[]; studentId: string }>
  teacherHours: Array<{ quantity: number; reason: string; teacherId: string }>
}

export interface MigrationReport {
  differences: Array<{ difference: number; mappedQuantity: number; sourceId: string; sourceQuantity: number; type: string }>
  mapped: Record<string, number>
  source: MigrationInventory['totals']
  unmapped: Record<string, string[]>
}

export interface MigrationPreview {
  plan: MigrationPlan
  previewHash: string
  ready: boolean
  report: MigrationReport
}

export interface MigrationApplyResult {
  counts: { programs: number; sessions: number; studentMappings: number; teacherAdjustments: number }
  differenceCount: number
  operationId: string
  previewHash: string
  replayed: boolean
  unexplainedCount: number
}

export interface ShadowExpectation {
  canSettle: boolean
  sessionId: string
  students: Array<{ action: string; sessionStudentId: string }>
  teachers: Array<{ action: string; quantity: number; sessionTeacherId: string }>
}

export interface ShadowResult {
  differenceCount: number
  generatedAt: string
  reports: Array<{
    actual: unknown
    differences: Array<{ actual: unknown; code: string; expected: unknown; field: string }>
    expectationProvided: boolean
    expected: ShadowExpectation | null
    sessionId: string
  }>
  sessionCount: number
  status: 'passed' | 'failed'
  writeCount: 0
}
