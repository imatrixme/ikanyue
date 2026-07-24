import { ShieldAlert } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile, RewardItem, RewardItemInput, StudentInput, StudentPointSummary, StudentPointsRow, StudentRecord, UploadProgressHandler } from '../../app/types'
import { Panel } from '../ui/Card'
import { ClassesWorkspace } from './ClassesWorkspace'
import { CoursesWorkspace, PackagesWorkspace } from './CourseCatalogWorkspaces'
import { DashboardWorkspace } from './DashboardWorkspace'
import { EnrollmentsWorkspace } from './EnrollmentsWorkspace'
import { LessonsWorkspace } from './LessonsWorkspace'
import { PointsWorkspace } from './PointsWorkspace'
import { AccountsWorkspace, AuditWorkspace, ExceptionsWorkspace, TeacherWorkloadWorkspace } from './ReadOnlyCourseWorkspaces'
import { RewardItemsPanel } from './RewardItemsPanel'
import { StudentWorkspace } from './StudentWorkspace'

interface AdminWorkspaceRoutesProps {
  api: OpsApi
  loading: boolean
  managedStudents: StudentRecord[]
  managedStudentsError?: string
  onAddPoints: (studentId: string, payload: { amount: number; reason?: string; remark?: string }) => Promise<boolean>
  onLoadManagedStudents: () => Promise<void>
  onLoadRewards: () => Promise<void>
  onLoadStudent: (studentId: string) => Promise<StudentPointSummary | null>
  onLoadStudents: () => Promise<void>
  onRedeem: (studentId: string, itemId: string, remark?: string) => Promise<boolean>
  onSaveReward: (id: string | null, payload: RewardItemInput) => Promise<boolean>
  onSaveStudent: (id: string | null, payload: StudentInput) => Promise<boolean>
  onUploadRewardImage: (id: string, file: File, onProgress?: UploadProgressHandler) => Promise<RewardItem | null>
  profile: OpsProfile
  rewards: RewardItem[]
  selectedStudentId: string
  studentSummary: StudentPointSummary | null
  students: StudentPointsRow[]
  token: string
}

export function AdminWorkspaceRoutes(props: AdminWorkspaceRoutesProps) {
  const courseProps = { api: props.api, token: props.token }
  return <Routes><Route path="/" element={<Navigate replace to="/dashboard" />} /><Route path="/dashboard" element={<Gate profile={props.profile} view="dashboard"><DashboardWorkspace {...courseProps} profile={props.profile} /></Gate>} /><Route path="/students" element={<Gate profile={props.profile} view="students"><StudentWorkspace api={props.api} errorMessage={props.managedStudentsError} loading={props.loading} onReload={props.onLoadManagedStudents} onSave={props.onSaveStudent} profile={props.profile} students={props.managedStudents} token={props.token} /></Gate>} /><Route path="/courses" element={<Gate profile={props.profile} view="courses"><CoursesWorkspace {...courseProps} /></Gate>} /><Route path="/packages" element={<Gate profile={props.profile} view="packages"><PackagesWorkspace {...courseProps} /></Gate>} /><Route path="/enrollments" element={<Gate profile={props.profile} view="enrollments"><EnrollmentsWorkspace {...courseProps} /></Gate>} /><Route path="/classes" element={<Gate profile={props.profile} view="classes"><ClassesWorkspace {...courseProps} /></Gate>} /><Route path="/lessons" element={<Gate profile={props.profile} view="lessons"><LessonsWorkspace {...courseProps} profile={props.profile} /></Gate>} /><Route path="/lesson-hours" element={<Gate profile={props.profile} view="accounts"><AccountsWorkspace {...courseProps} /></Gate>} /><Route path="/teacher-workload" element={<Gate profile={props.profile} view="teachers"><TeacherWorkloadWorkspace {...courseProps} /></Gate>} /><Route path="/exceptions" element={<Gate profile={props.profile} view="exceptions"><ExceptionsWorkspace {...courseProps} /></Gate>} /><Route path="/audit" element={<Gate profile={props.profile} view="audit"><AuditWorkspace {...courseProps} /></Gate>} /><Route path="/points" element={<Gate profile={props.profile} view="points"><PointsWorkspace loading={props.loading} rewards={props.rewards} selectedStudentId={props.selectedStudentId} studentSummary={props.studentSummary} students={props.students} onAddPoints={props.onAddPoints} onLoadStudent={props.onLoadStudent} onRedeem={props.onRedeem} onReloadStudents={props.onLoadStudents} /></Gate>} /><Route path="/rewards" element={<Gate profile={props.profile} view="rewards"><RewardItemsPanel loading={props.loading} rewards={props.rewards} onReloadRewards={props.onLoadRewards} onSave={props.onSaveReward} onUploadImage={props.onUploadRewardImage} /></Gate>} /><Route path="*" element={<Navigate replace to="/dashboard" />} /></Routes>
}

function Gate({ children, profile, view }: { children: React.ReactNode; profile: OpsProfile; view: AppView }) {
  if (canAccessView(profile, view)) return <>{children}</>
  return <Panel className="mx-auto max-w-xl p-8 text-center"><div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--danger-soft)] text-[var(--destructive)]"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></div><h1 className="text-xl font-semibold">当前账号无权访问</h1><p className="ky-paragraph mt-2">该工作区需要相应的课程运营能力，服务端仍会对每个请求执行最终授权。</p></Panel>
}
