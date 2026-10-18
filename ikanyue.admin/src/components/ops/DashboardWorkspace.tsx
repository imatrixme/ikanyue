import { ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { BookingDashboard } from '../../app/bookingTypes'
import { formatDateTime, lessonNextStep, localDateKey, personName, recordName } from '../../app/coursePresentation'
import type { CourseAccount, CourseCapability, CourseRecord, EnrollmentOperation, Lesson } from '../../app/courseTypes'
import { viewPaths } from '../../app/navigation'
import type { OpsProfile, StudentRecord } from '../../app/types'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { IconButton } from '../ui/Controls'
import { AsyncState } from '../ui/DataDisplay'

// Students who have used or lost hours, now hold at most this many and have nothing booked, need a renewal conversation.
const RENEWAL_THRESHOLD = 2

interface TodayData {
  lessons: Lesson[]
  enrollments: EnrollmentOperation[]
  accounts: CourseAccount[]
  students: StudentRecord[]
  teacherEvents: CourseRecord[]
  exceptions: CourseRecord[]
  bookings: BookingDashboard
}

interface TaskRow { key: string; main: string; meta?: string; status?: string; to: string }

export function DashboardWorkspace({ api, profile, token }: { api: OpsApi; profile: OpsProfile; token: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const capabilities = new Set(profile.courseCreditCapabilities || [])
  const allowed = (capability: CourseCapability) => profile.isAdmin || capabilities.has(capability)
  const canAcademic = allowed('course_credit.academic')
  const canTeach = allowed('course_credit.teacher')
  const canSettle = allowed('course_credit.settlement')
  const canFinance = allowed('course_credit.finance')
  const canAudit = allowed('course_credit.audit')

  const load = useCallback(async () => {
    setLoading(true)
    setNow(Date.now())
    setError('')
    try {
      const page = { page: 1, perPage: 100 }
      const lessonResource = canAcademic || canSettle ? 'lessons' : 'assignedLessons'
      const [lessons, enrollments, accounts, students, teacherEvents, settlementExceptions, reconciliationExceptions, bookings] = await Promise.all([
        canAcademic || canTeach || canSettle ? api.listCourseResource<Lesson>(token, lessonResource, page) : emptyPage<Lesson>(),
        canFinance ? api.listCourseResource<EnrollmentOperation>(token, 'enrollments', page) : emptyPage<EnrollmentOperation>(),
        canFinance ? api.listCourseResource<CourseAccount>(token, 'accounts', page) : emptyPage<CourseAccount>(),
        canFinance ? api.listManagedStudents(token, page) : emptyPage<StudentRecord>(),
        canTeach ? api.listCourseResource(token, 'teacherEvents', page) : emptyPage<CourseRecord>(),
        canSettle ? api.listCourseResource(token, 'settlementExceptions', page) : emptyPage<CourseRecord>(),
        canAudit ? api.listCourseResource(token, 'reconciliationExceptions', page) : emptyPage<CourseRecord>(),
        canAcademic ? api.getBookingDashboard(token) : emptyBookingDashboard(),
      ])
      setData({
        accounts: accounts.items,
        bookings,
        enrollments: enrollments.items,
        exceptions: [...settlementExceptions.items, ...reconciliationExceptions.items],
        lessons: lessons.items,
        students: students.items,
        teacherEvents: teacherEvents.items,
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载今日待办失败')
    } finally {
      setLoading(false)
    }
  }, [api, canAcademic, canAudit, canFinance, canSettle, canTeach, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const today = localDateKey(now)
  const lessonLink = (lesson: Lesson) => `${viewPaths.lessons}?sessionId=${encodeURIComponent(lesson.id)}`
  const lessonRow = (lesson: Lesson, withDate: boolean): TaskRow => ({ key: lesson.id, main: lesson.title || recordName(lesson), meta: withDate ? formatDateTime(lesson.startAt) : timeOf(lesson.startAt), status: lessonNextStep(lesson, now), to: lessonLink(lesson) })
  const studentName = (studentId: string) => personName(data?.students.find((item) => item.id === studentId), studentId)

  const groups: Array<{ title: string; rows: TaskRow[] }> = data ? [
    {
      title: '今日课堂',
      rows: data.lessons
        .filter((lesson) => localDateKey(lesson.startAt) === today && lesson.status !== 'draft')
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .map((lesson) => lessonRow(lesson, false)),
    },
    {
      title: '待确认预约',
      rows: data.bookings.pending.map((item) => ({ key: item.appointmentId, main: `${item.student.name} · ${item.course.name}`, meta: `${formatDateTime(item.startAt)} · ${item.teacher.name}`, status: '待确认', to: `${viewPaths.appointments}?status=pending` })),
    },
    {
      title: '待核销课堂',
      rows: canSettle ? data.lessons
        .filter((lesson) => lesson.status === 'completed' || lesson.status === 'correction_pending')
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .map((lesson) => lessonRow(lesson, true)) : [],
    },
    {
      title: `需要续课（剩余 ≤ ${RENEWAL_THRESHOLD} 课时）`,
      rows: data.accounts
        .filter((account) => Number(account.availableQuantity || 0) <= RENEWAL_THRESHOLD && Number(account.frozenQuantity || 0) === 0 && Number(account.consumedQuantity || 0) + Number(account.expiredQuantity || 0) > 0)
        .sort((a, b) => Number(a.availableQuantity || 0) - Number(b.availableQuantity || 0))
        .map((account) => ({ key: account.studentId, main: studentName(account.studentId), meta: Number(account.expiredQuantity || 0) > 0 ? `已过期 ${account.expiredQuantity} 课时` : undefined, status: `剩 ${account.availableQuantity || 0} 课时`, to: `${viewPaths.students}/${encodeURIComponent(account.studentId)}` })),
    },
    {
      title: '报课后待同步名单',
      rows: data.enrollments
        .filter((item) => item.resultSnapshot.status === 'synchronizing_future_lessons')
        .map((item) => ({ key: item.id, main: studentName(item.studentId), meta: formatDateTime(item.created, ''), status: '待同步', to: viewPaths.enrollments })),
    },
    {
      title: '异常',
      rows: data.exceptions.length ? [{ key: 'exceptions', main: `${data.exceptions.length} 条核销或对账异常`, to: viewPaths.exceptions }] : [],
    },
    {
      title: '待确认工作量',
      rows: data.teacherEvents.some((item) => item.status === 'pending') ? [{ key: 'workload', main: `${data.teacherEvents.filter((item) => item.status === 'pending').length} 条授课工作量待确认`, to: viewPaths.teachers }] : [],
    },
  ].filter((group) => group.rows.length > 0) : []

  return (
    <WorkspacePanel>
      <PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新今日待办" onClick={() => void load()} type="button" />} title={`今天 · ${new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}`} />
      <AsyncState empty={data && groups.length === 0 ? <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">今天没有待办</p> : undefined} error={error} loading={loading && !data} loadingLabel="正在加载今日待办..." onRetry={() => void load()}>
        <div className="divide-y divide-[var(--border)]">
          {groups.map((group) => (
            <section aria-label={group.title} key={group.title}>
              <h2 className="flex items-center gap-2 px-4 pb-1 pt-4 text-sm font-semibold sm:px-5">{group.title}<span className="font-normal text-[var(--muted-foreground)]">{group.rows.length}</span></h2>
              <ul className="pb-2">
                {group.rows.map((row) => (
                  <li key={row.key}>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--secondary)] sm:px-5" onClick={() => navigate(row.to)} type="button">
                      {row.meta ? <span className="w-28 shrink-0 tabular-nums text-[var(--muted-foreground)]">{row.meta}</span> : null}
                      <span className="min-w-0 flex-1 truncate">{row.main}</span>
                      {row.status ? <Badge tone={statusTone(row.status)}>{row.status}</Badge> : null}
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </AsyncState>
    </WorkspacePanel>
  )
}

function statusTone(status: string) {
  if (status === '已核销') return 'green'
  if (status === '已取消') return 'neutral'
  if (status === '待上课') return 'blue'
  return 'amber'
}

function timeOf(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间待定' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function emptyPage<T>() { return Promise.resolve({ items: [] as T[], page: 1, perPage: 100, totalItems: 0, totalPages: 0 }) }
function emptyBookingDashboard(): Promise<BookingDashboard> { return Promise.resolve({ pending: [], pendingCount: 0, upcoming: [], openConflicts: [], openConflictCount: 0 }) }
