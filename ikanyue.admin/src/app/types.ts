export type Role = 'teacher' | 'admin'

import type { CourseCapability, CourseRecord } from './courseTypes'

export type AppView =
  | 'dashboard'
  | 'students'
  | 'courses'
  | 'packages'
  | 'enrollments'
  | 'classes'
  | 'lessons'
  | 'appointments'
  | 'accounts'
  | 'teachers'
  | 'exceptions'
  | 'audit'
  | 'points'
  | 'rewards'

export interface OpsProfile {
  id: string
  role: Role
  isAdmin: boolean
  nickName: string
  realName: string
  cellphone: string
  verified: boolean
  blocked: boolean
  passwordChangeRequired?: boolean
  courseCreditCapabilities?: CourseCapability[]
}

export interface LoginResult {
  token: string
  profile: OpsProfile
}

export interface RegisterResult {
  status: 'pending_activation'
  message: string
  profile: OpsProfile
}

export interface Pagination {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface ListResult<T> {
  items: T[]
  pagination: Pagination
}

export interface StudentPointsRow {
  id: string
  realName: string
  nickName: string
  cellphone: string
  avatar?: string
  balance: number
}

export interface StudentRecord {
  avatar: string
  blocked: boolean
  cellphone: string
  created: string
  id: string
  lastLoginAt: string
  nickName: string
  realName: string
  updated: string
  classAssignments?: CourseRecord[]
  lessonAssignments?: CourseRecord[]
}

export interface StudentInput {
  blocked: boolean
  cellphone: string
  nickName?: string
  password?: string
  realName: string
}

export type PointEventType = 'earn' | 'offline_redeem'

export interface PointEvent {
  id: string
  studentId: string
  type: PointEventType
  delta: number
  balanceAfter: number
  reason: string
  remark?: string
  rewardItemId?: string
  rewardSnapshot?: {
    id: string
    name: string
    pointsPrice: number
  } | null
  created?: string
}

export interface StudentPointSummary {
  studentId: string
  balance: number
  events: PointEvent[]
  pagination: Pagination
  reward?: RewardItem
}

export interface RewardItem {
  id: string
  name: string
  description: string
  image: string
  pointsPrice: number
  sortOrder?: number
  status: 'active' | 'inactive'
}

export interface RewardItemInput {
  name: string
  description?: string
  image?: string
  pointsPrice: number
  sortOrder?: number
  status?: 'active' | 'inactive'
}

export type UploadProgressHandler = (percent: number) => void

export interface AddPointsInput {
  studentId: string
  amount: number
  reason?: string
  remark?: string
}

export interface OfflineRedeemInput {
  studentId: string
  itemId: string
  remark?: string
}

export interface ToastState {
  type: 'info' | 'error'
  message: string
}

export interface AppState {
  profile: OpsProfile | null
  token: string
  activeView: AppView
  loading: boolean
  toast: ToastState | null
  students: ListResult<StudentPointsRow> | null
  managedStudents: ListResult<StudentRecord> | null
  managedStudentsError: string
  rewards: ListResult<RewardItem> | null
  selectedStudentId: string
  selectedStudentSummary: StudentPointSummary | null
}

export type AppAction =
  | { type: 'login:start' }
  | { type: 'login:success'; payload: LoginResult }
  | { type: 'logout' }
  | { type: 'view:set'; payload: AppView }
  | { type: 'loading:set'; payload: boolean }
  | { type: 'toast:set'; payload: ToastState | null }
  | { type: 'students:set'; payload: ListResult<StudentPointsRow> }
  | { type: 'managedStudents:set'; payload: ListResult<StudentRecord> }
  | { type: 'managedStudents:error'; payload: string }
  | { type: 'rewards:set'; payload: ListResult<RewardItem> }
  | { type: 'student:select'; payload: string }
  | { type: 'studentSummary:set'; payload: StudentPointSummary | null }
