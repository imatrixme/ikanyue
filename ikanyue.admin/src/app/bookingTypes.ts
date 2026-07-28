export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'slot_taken'
  | 'eligibility_lost'
  | 'cancelled'
  | 'rescheduled'
  | 'fulfilled'

export interface BookingPage<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface BookingPerson {
  name: string
  avatar?: string
}

export interface BookingAppointment {
  appointmentId: string
  status: BookingStatus
  course: { courseId: string; name: string }
  teacher: BookingPerson & { teacherId: string }
  student: BookingPerson & { studentId: string }
  startAt: string
  endAt: string
  location: string
  note: string
  responseReason: string
  responseDeadline: string | null
  lessonId: string
  canCancel: boolean
  canConfirm: boolean
  canDecline: boolean
  version: number
}

export interface BookingEvent {
  id: string
  eventType: string
  fromStatus?: string
  toStatus: string
  actorId?: string
  actorRole: string
  reason?: string
  created?: string
  metadata?: Record<string, unknown>
}

export interface ScheduleClaim {
  id: string
  ownerType: 'teacher' | 'student' | 'room'
  ownerId: string
  cellStartAt: string
  cellEndAt: string
  status: 'active' | 'released'
}

export interface BookingAppointmentDetail extends BookingAppointment {
  events: BookingEvent[]
  claims: ScheduleClaim[]
}

export interface BookingDashboard {
  pending: BookingAppointment[]
  pendingCount: number
  upcoming: BookingAppointment[]
  openConflicts: BookingConflict[]
  openConflictCount: number
}

export interface BookingPolicy {
  id: string
  code: string
  name: string
  timezone: string
  defaultWindows: Array<{ startMinute: number; endMinute: number }>
  slotStepMinutes: number
  claimGranularityMinutes?: number
  minLeadMinutes: number
  maxAdvanceDays: number
  responseTtlMinutes: number
  responseCutoffMinutes: number
  cancellationCutoffMinutes: number
  version: number
  effectiveFrom: string
  effectiveTo: string | null
  status: 'draft' | 'active' | 'inactive'
}

export interface BookingPolicyInput {
  code: string
  name: string
  timezone: string
  defaultWindows: Array<{ startMinute: number; endMinute: number }>
  slotStepMinutes: number
  claimGranularityMinutes: number
  minLeadMinutes: number
  maxAdvanceDays: number
  responseTtlMinutes: number
  responseCutoffMinutes: number
  cancellationCutoffMinutes: number
  effectiveFrom: string
  effectiveTo?: string
  status: 'draft' | 'active' | 'inactive'
}

export interface BookingOffering {
  id: string
  teacher: BookingPerson & { teacherId: string }
  course: { courseId: string; name: string }
  creditTypeId: string
  policyId: string
  location: string
  availabilityMode: 'default' | 'custom'
  status: 'draft' | 'active' | 'inactive'
  version: number
}

export interface BookingOfferingInput {
  teacherId: string
  courseSpecId: string
  creditTypeId: string
  policyId: string
  location: string
  status: 'draft' | 'active' | 'inactive'
}

export interface BookingWeeklyRule {
  id?: string
  teacherId?: string
  offeringId?: string
  weekday: number
  startMinute: number
  endMinute: number
  status?: 'active' | 'inactive'
}

export interface BookingAvailabilityOverride {
  id: string
  teacherId: string
  offeringId: string
  type: 'available' | 'unavailable'
  startAt: string
  endAt: string
  reason: string
  status: 'active' | 'cancelled'
}

export interface BookingAvailability {
  rules: BookingWeeklyRule[]
  overrides: BookingAvailabilityOverride[]
}

export interface BookingConflict {
  id: string
  type: string
  status: 'open' | 'resolved' | 'ignored'
  teacherId?: string
  studentId?: string
  sessionId?: string
  appointmentId?: string
  startAt: string
  endAt: string
  details?: Record<string, unknown>
  resolution?: string
  resolvedAt?: string
}

export interface BookingReferenceData {
  teachers: Array<{ id: string; name: string; cellphone: string; avatar: string }>
  courses: Array<{ id: string; code: string; name: string; durationMinutes: number; defaultCreditTypeId: string }>
  creditTypes: Array<{ id: string; code: string; name: string; courseSpecId: string; unitLabel: string }>
  policies: BookingPolicy[]
}

export interface BookingAppointmentQuery {
  page?: number
  perPage?: number
  status?: string
  teacherId?: string
  studentId?: string
  courseSpecId?: string
  from?: string
  to?: string
}

export interface BookingListQuery {
  page?: number
  perPage?: number
  status?: string
  teacherId?: string
  courseSpecId?: string
  offeringId?: string
}

export interface BookingBackfillPreview {
  claimed: number
  conflicts: BookingConflict[]
  ready: boolean
  scannedCount: number
}

export interface BookingBackfillResult {
  claimedSessionIds: string[]
  conflictCount: number
  disabledOfferingIds: string[]
  operationId: string
  scannedCount: number
}

export interface BookingCommandResult {
  operationId?: string
  status?: string
  [key: string]: unknown
}
