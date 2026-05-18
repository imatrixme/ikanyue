import type { LucideIcon } from 'lucide-react'
import type { AssessmentAnswers } from './assessment'

export type Role = 'teacher' | 'admin'

export type OpsResource =
  | 'students'
  | 'teachers'
  | 'activities'
  | 'audioMaterials'
  | 'videoMaterials'
  | 'operationSlots'
  | 'auditLogs'

export type AppView =
  | 'dashboard'
  | OpsResource
  | 'assessmentTemplates'
  | 'assessmentWorkspace'
  | 'reports'
  | 'sharePreview'

export interface OpsProfile {
  id: string
  role: Role
  isAdmin: boolean
  nickName: string
  realName: string
  cellphone: string
  verified: boolean
  blocked: boolean
}

export interface LoginResult {
  token: string
  profile: OpsProfile
}

export interface DashboardCard {
  key: string
  label: string
  value: number
}

export interface DashboardData {
  cards: DashboardCard[]
  pending: DashboardCard[]
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

export interface ResourceRecord {
  id: string
  [key: string]: unknown
}

export interface AssessmentOption {
  value: string
  label: string
  score: number
}

export interface AssessmentItem {
  key: string
  label: string
  type: 'single_choice' | 'multi_choice' | 'score_slider' | 'number_score' | 'textarea' | 'rich_comment'
  required?: boolean
  options?: AssessmentOption[]
}

export interface AssessmentSection {
  key: string
  title: string
  weight: number
  items: AssessmentItem[]
}

export interface AssessmentSchema {
  sections: AssessmentSection[]
  scoring: {
    type: 'weighted_sum' | 'rubric_sum'
    maxScore: number
    gradeBands: Array<{ min: number; label: string }>
  }
}

export interface AssessmentTemplate {
  id: string
  name: string
  version: number
  status: 'draft' | 'published'
  schemaJson: AssessmentSchema
  scoringJson: AssessmentSchema['scoring']
  reportJson: { title?: string }
  updated?: string
}

export interface AssessmentReport {
  id: string
  studentId: string
  teacherId: string
  templateId: string
  totalScore: number
  grade: string
  created?: string
  reportJson?: unknown
}

export interface AssessmentRecord {
  id: string
  studentId: string
  teacherId?: string
  templateId: string
  status: 'draft' | 'submitted'
  answersJson?: AssessmentAnswers
  scoreJson?: unknown
}

export interface ShareLink {
  id: string
  reportId: string
  token: string
  expiresAt?: string
  revokedAt?: string
}

export interface SharePreview {
  id: string
  title: string
  student: { name: string; nickName?: string }
  teacher: { name: string; nickName?: string }
  score: { totalScore: number; grade: string }
  generatedAt: string
}

export interface NavItem {
  view: AppView
  label: string
  icon: LucideIcon
  adminOnly?: boolean
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
  dashboard: DashboardData | null
  resources: Partial<Record<OpsResource, ListResult<ResourceRecord>>>
  templates: ListResult<AssessmentTemplate> | null
  reports: ListResult<AssessmentReport> | null
  sharePreview: SharePreview | null
}

export type AppAction =
  | { type: 'login:start' }
  | { type: 'login:success'; payload: LoginResult }
  | { type: 'logout' }
  | { type: 'view:set'; payload: AppView }
  | { type: 'loading:set'; payload: boolean }
  | { type: 'toast:set'; payload: ToastState | null }
  | { type: 'dashboard:set'; payload: DashboardData }
  | { type: 'resource:set'; resource: OpsResource; payload: ListResult<ResourceRecord> }
  | { type: 'templates:set'; payload: ListResult<AssessmentTemplate> }
  | { type: 'reports:set'; payload: ListResult<AssessmentReport> }
  | { type: 'share:set'; payload: SharePreview }
