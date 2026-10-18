import { ShieldAlert } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { legacyViewPaths, viewPaths } from '../../app/navigation'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile, RewardItem, RewardItemInput, StudentInput, StudentPointSummary, StudentPointsRow, StudentRecord, UploadProgressHandler } from '../../app/types'
import { Panel } from '../ui/Card'
import { ClassesWorkspace } from './ClassesWorkspace'
import { CoursesWorkspace, PackagesWorkspace } from './CourseCatalogWorkspaces'
import { DashboardWorkspace } from './DashboardWorkspace'
import { EnrollmentsWorkspace } from './EnrollmentsWorkspace'
import { LessonsWorkspace } from './LessonsWorkspace'
import { MigrationWorkspace } from './MigrationWorkspace'
import { PointsWorkspace } from './PointsWorkspace'
import { AccountsWorkspace, AuditWorkspace, ExceptionsWorkspace } from './ReadOnlyCourseWorkspaces'
import { BookingWorkspace } from './BookingWorkspace'
import { CourseCalendarWorkspace } from './CourseCalendarWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'
import { StudentDetailPage } from './StudentDetailPage'
import { StudentWorkspace } from './StudentWorkspace'
import { TeacherWorkloadWorkspace } from './TeacherWorkloadWorkspace'
import { PaymentsWorkspace } from './PaymentsWorkspace'

interface AdminWorkspaceRoutesProps {
  api: OpsApi
  loading: boolean
  managedStudents: StudentRecord[]
  managedStudentsError?: string
  managedStudentsTotal?: number
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
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to={viewPaths.dashboard} />} />
      <Route path={viewPaths.dashboard} element={<Gate profile={props.profile} view="dashboard"><DashboardWorkspace {...courseProps} profile={props.profile} /></Gate>} />
      <Route path={viewPaths.students} element={<Gate profile={props.profile} view="students"><StudentWorkspace api={props.api} errorMessage={props.managedStudentsError} loading={props.loading} onReload={props.onLoadManagedStudents} onSave={props.onSaveStudent} profile={props.profile} students={props.managedStudents} token={props.token} totalStudents={props.managedStudentsTotal} /></Gate>} />
      <Route path={`${viewPaths.students}/:studentId`} element={<Gate profile={props.profile} view="students"><StudentDetailRoute api={props.api} profile={props.profile} token={props.token} /></Gate>} />
      <Route path={viewPaths.courses} element={<Gate profile={props.profile} view="courses"><CoursesWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.packages} element={<Gate profile={props.profile} view="packages"><PackagesWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.enrollments} element={<Gate profile={props.profile} view="enrollments"><EnrollmentsWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.classes} element={<Gate profile={props.profile} view="classes"><ClassesWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.lessons} element={<Gate profile={props.profile} view="lessons"><LessonsWorkspace {...courseProps} profile={props.profile} /></Gate>} />
      <Route path={viewPaths.calendar} element={<Gate profile={props.profile} view="calendar"><CourseCalendarWorkspace {...courseProps} profile={props.profile} /></Gate>} />
      <Route path={viewPaths.appointments} element={<Gate profile={props.profile} view="appointments"><BookingWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.accounts} element={<Gate profile={props.profile} view="accounts"><AccountsWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.payments} element={<Gate profile={props.profile} view="payments"><PaymentsWorkspace token={props.token} /></Gate>} />
      <Route path={viewPaths.teachers} element={<Gate profile={props.profile} view="teachers"><TeacherWorkloadWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.exceptions} element={<Gate profile={props.profile} view="exceptions"><ExceptionsWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.audit} element={<Gate profile={props.profile} view="audit"><AuditWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.migration} element={<Gate profile={props.profile} view="migration"><MigrationWorkspace {...courseProps} /></Gate>} />
      <Route path={viewPaths.points} element={<Gate profile={props.profile} view="points"><PointsWorkspace loading={props.loading} rewards={props.rewards} selectedStudentId={props.selectedStudentId} studentSummary={props.studentSummary} students={props.students} onAddPoints={props.onAddPoints} onLoadStudent={props.onLoadStudent} onRedeem={props.onRedeem} onReloadStudents={props.onLoadStudents} /></Gate>} />
      <Route path={viewPaths.rewards} element={<Gate profile={props.profile} view="rewards"><RewardItemsPanel loading={props.loading} rewards={props.rewards} onReloadRewards={props.onLoadRewards} onSave={props.onSaveReward} onUploadImage={props.onUploadRewardImage} /></Gate>} />
      {Object.entries(legacyViewPaths).map(([path, view]) => <Route element={<LegacyRedirect to={viewPaths[view]} />} key={path} path={path} />)}
      <Route path="*" element={<Navigate replace to={viewPaths.dashboard} />} />
    </Routes>
  )
}

function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation()
  return <Navigate replace to={`${to}${location.search}`} />
}

function StudentDetailRoute({ api, profile, token }: { api: OpsApi; profile: OpsProfile; token: string }) {
  const { studentId = '' } = useParams()
  if (!profile.isAdmin) return <Navigate replace to={viewPaths.students} />
  return <StudentDetailPage api={api} key={studentId} studentId={studentId} token={token} />
}

function Gate({ children, profile, view }: { children: React.ReactNode; profile: OpsProfile; view: AppView }) {
  if (canAccessView(profile, view)) return <>{children}</>
  return <Panel className="mx-auto max-w-xl p-8 text-center"><div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--danger-soft)] text-[var(--destructive)]"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></div><h1 className="text-xl font-semibold">当前账号无权访问</h1><p className="ky-paragraph mt-2">该工作区需要相应的课程运营能力，服务端仍会对每个请求执行最终授权。</p></Panel>
}
