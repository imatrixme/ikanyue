import { ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { BookingDashboard } from '../../app/bookingTypes'
import { addDateDays, shanghaiDayStartIso, todayKey } from '../../app/calendarLogic'
import { listAllCourseResource, type AllPages } from '../../app/courseApi'
import { formatDateTime, lessonActions, lessonNextStep, personName, recordName } from '../../app/coursePresentation'
import type { CourseCapability, CourseRecord, EnrollmentOperation, Lesson, RenewalCandidate, StudentFollowUpInput } from '../../app/courseTypes'
import { viewPaths } from '../../app/navigation'
import { listAllStudents } from '../../app/studentDirectory'
import type { OpsProfile, StudentRecord } from '../../app/types'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, TruncationNotice } from '../ui/DataDisplay'
import { useNotify } from '../ui/notifyContext'
import { FollowUpDialog } from './FollowUpDialog'

interface TodayData {
  todayLessons: AllPages<Lesson>
  unsettledLessons: AllPages<Lesson>
  enrollments: AllPages<EnrollmentOperation>
  // Same rule as the 待续费 list and the automatic reminders, one row per student.
  renewals: RenewalCandidate[]
  snoozed: Set<string>
  students: StudentRecord[]
  pendingWorkload: number
  exceptions: number
  bookings: BookingDashboard
}

interface TaskRow { key: string; main: string; meta?: string; status?: string; to: string; action?: { label: string; done?: boolean; run: () => void } }
interface TaskGroup { title: string; rows: TaskRow[]; page?: AllPages<unknown> }

export function DashboardWorkspace({ api, profile, token }: { api: OpsApi; profile: OpsProfile; token: string }) {
  const navigate = useNavigate()
  const notify = useNotify()
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [attended, setAttended] = useState<Set<string>>(() => new Set())
  const [followUpTarget, setFollowUpTarget] = useState<{ studentId: string; name: string } | null>(null)
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
      const day = todayKey()
      const lessonResource = canAcademic ? 'lessons' : 'assignedLessons'
      const [todayLessons, completed, correcting, enrollments, renewals, teacherEvents, settlementExceptions, reconciliationExceptions, bookings] = await Promise.all([
        canAcademic || canTeach ? listAllCourseResource<Lesson>(api, token, lessonResource, { from: shanghaiDayStartIso(day), to: shanghaiDayStartIso(addDateDays(day, 1)) }) : emptyPages<Lesson>(),
        canSettle ? listAllCourseResource<Lesson>(api, token, 'lessons', { status: 'completed' }) : emptyPages<Lesson>(),
        canSettle ? listAllCourseResource<Lesson>(api, token, 'lessons', { status: 'correction_pending' }) : emptyPages<Lesson>(),
        canFinance ? listAllCourseResource<EnrollmentOperation>(api, token, 'enrollments') : emptyPages<EnrollmentOperation>(),
        canFinance ? api.listRenewals(token).then((result) => result.items) : Promise.resolve<RenewalCandidate[]>([]),
        canTeach ? listAllCourseResource(api, token, 'teacherEvents', { status: 'pending' }) : emptyPages<CourseRecord>(),
        canSettle ? listAllCourseResource(api, token, 'settlementExceptions') : emptyPages<CourseRecord>(),
        canAudit ? listAllCourseResource(api, token, 'reconciliationExceptions') : emptyPages<CourseRecord>(),
        canAcademic ? api.getBookingDashboard(token) : emptyBookingDashboard(),
      ])
      const [students, overview] = await Promise.all([
        enrollments.items.some(pendingSync) ? listAllStudents(api, token) : emptyPages<StudentRecord>(),
        renewals.length ? loadOverview(api, token, renewals.map((item) => item.studentId)) : Promise.resolve([]),
      ])
      const current = Date.now()
      setData({
        bookings,
        enrollments,
        exceptions: settlementExceptions.totalItems + reconciliationExceptions.totalItems,
        pendingWorkload: teacherEvents.totalItems,
        renewals,
        snoozed: new Set(overview.filter((item) => item.followUp?.snoozeUntil && Date.parse(item.followUp.snoozeUntil) > current).map((item) => item.studentId)),
        students: students.items,
        todayLessons,
        unsettledLessons: mergePages(completed, correcting),
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载今日待办失败')
    } finally {
      setLoading(false)
    }
  }, [api, canAcademic, canAudit, canFinance, canSettle, canTeach, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function markAllPresent(lesson: Lesson) {
    setActionError('')
    try {
      await api.markAllPresent(token, lesson.id)
      setAttended((current) => new Set(current).add(lesson.id))
      notify(`「${lesson.title || recordName(lesson)}」已全部标记为到课`)
    } catch (markError) {
      setActionError(markError instanceof Error ? markError.message : '标记到课失败')
    }
  }

  async function saveFollowUp(studentId: string, name: string, input: StudentFollowUpInput) {
    await api.recordFollowUp(token, studentId, input)
    setData((current) => current ? { ...current, snoozed: new Set(current.snoozed).add(studentId) } : current)
    notify(`已记录 ${name} 的续课跟进`)
  }

  const lessonLink = (lesson: Lesson) => `${viewPaths.lessons}?sessionId=${encodeURIComponent(lesson.id)}`
  const lessonRow = (lesson: Lesson, withDate: boolean): TaskRow => ({ key: lesson.id, main: lesson.title || recordName(lesson), meta: withDate ? formatDateTime(lesson.startAt) : timeOf(lesson.startAt), status: lessonNextStep(lesson, now), to: lessonLink(lesson) })
  const studentName = (studentId: string) => personName(data?.students.find((item) => item.id === studentId), studentId)
  const canTakeAttendance = (lesson: Lesson) => canTeach && lessonActions(lesson, now).attendance && lesson.status !== 'completed'

  const groups: TaskGroup[] = data ? [
    {
      title: '今日课堂',
      page: data.todayLessons,
      rows: data.todayLessons.items
        .filter((lesson) => lesson.status !== 'draft')
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .map((lesson) => ({
          ...lessonRow(lesson, false),
          action: canTakeAttendance(lesson) ? { label: attended.has(lesson.id) ? '已全部到课' : '全部到课', done: attended.has(lesson.id), run: () => void markAllPresent(lesson) } : undefined,
        })),
    },
    {
      title: '待确认预约',
      rows: data.bookings.pending.map((item) => ({ key: item.appointmentId, main: `${item.student.name} · ${item.course.name}`, meta: `${formatDateTime(item.startAt)} · ${item.teacher.name}`, status: '待确认', to: `${viewPaths.appointments}?status=pending` })),
    },
    {
      title: '待核销课堂',
      page: data.unsettledLessons,
      rows: data.unsettledLessons.items
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .map((lesson) => lessonRow(lesson, true)),
    },
    {
      title: '待续费',
      rows: data.renewals
        .filter((item) => !data.snoozed.has(item.studentId))
        .map((item) => ({
          key: item.studentId,
          main: item.studentName,
          meta: item.courseName,
          status: item.reason === 'expiring' ? `${shortDate(item.validUntil)}到期` : `剩 ${item.remainingLessons} 课时`,
          to: `${viewPaths.students}/${encodeURIComponent(item.studentId)}`,
          action: { label: '记录跟进', run: () => setFollowUpTarget({ studentId: item.studentId, name: item.studentName }) },
        })),
    },
    {
      title: '报课后待同步名单',
      page: data.enrollments,
      rows: data.enrollments.items
        .filter(pendingSync)
        .map((item) => ({ key: item.id, main: studentName(item.studentId), meta: formatDateTime(item.created, ''), status: '待同步', to: viewPaths.enrollments })),
    },
    {
      title: '异常',
      rows: data.exceptions ? [{ key: 'exceptions', main: `${data.exceptions} 条核销或对账异常`, to: viewPaths.exceptions }] : [],
    },
    {
      title: '待确认工作量',
      rows: data.pendingWorkload ? [{ key: 'workload', main: `${data.pendingWorkload} 条授课工作量待确认`, to: viewPaths.teachers }] : [],
    },
  ].filter((group) => group.rows.length > 0) : []

  return (
    <WorkspacePanel>
      <PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新今日待办" onClick={() => void load()} type="button" />} title={`今天 · ${new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' })}`} />
      {actionError ? <p className="border-b border-[var(--border)] px-4 py-2 text-sm text-[var(--destructive)] sm:px-5" role="alert">{actionError}</p> : null}
      <AsyncState empty={data && groups.length === 0 ? <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">今天没有待办</p> : undefined} error={error} loading={loading && !data} loadingLabel="正在加载今日待办..." onRetry={() => void load()}>
        <div className="divide-y divide-[var(--border)]">
          {groups.map((group) => (
            <section aria-label={group.title} key={group.title}>
              <h2 className="flex items-center gap-2 px-4 pb-1 pt-4 text-sm font-semibold sm:px-5">{group.title}<span className="font-normal text-[var(--muted-foreground)]">{group.rows.length}</span></h2>
              {group.page ? <TruncationNotice shown={group.page.items.length} total={group.page.totalItems} /> : null}
              <ul className="pb-2">
                {group.rows.map((row) => (
                  <li className="flex items-center gap-2 pr-4 hover:bg-[var(--muted)] sm:pr-5" key={row.key}>
                    <button className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left text-sm sm:pl-5" onClick={() => navigate(row.to)} type="button">
                      {row.meta ? <span className="w-28 shrink-0 truncate tabular-nums text-[var(--muted-foreground)]">{row.meta}</span> : null}
                      <span className="min-w-0 flex-1 truncate">{row.main}</span>
                      {row.status ? <Badge tone={statusTone(row.status)}>{row.status}</Badge> : null}
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                    </button>
                    {row.action ? <Button aria-label={`${row.main}${row.action.label}`} className="h-8 shrink-0 px-2.5 text-xs" disabled={row.action.done} onClick={row.action.run} type="button" variant="secondary">{row.action.label}</Button> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </AsyncState>
      {followUpTarget ? <FollowUpDialog onClose={() => setFollowUpTarget(null)} onSave={(input) => saveFollowUp(followUpTarget.studentId, followUpTarget.name, input)} studentName={followUpTarget.name} /> : null}
    </WorkspacePanel>
  )
}

function pendingSync(item: EnrollmentOperation) { return item.resultSnapshot.status === 'synchronizing_future_lessons' }

async function loadOverview(api: OpsApi, token: string, studentIds: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < studentIds.length; index += 100) chunks.push(studentIds.slice(index, index + 100))
  return (await Promise.all(chunks.map((ids) => api.getStudentOverview(token, ids)))).flat()
}

function mergePages<T>(...pages: AllPages<T>[]): AllPages<T> {
  const items = pages.flatMap((page) => page.items)
  const totalItems = pages.reduce((sum, page) => sum + page.totalItems, 0)
  return { items, totalItems, truncated: totalItems > items.length }
}

function statusTone(status: string) {
  if (status === '已核销') return 'green'
  if (status === '已取消') return 'neutral'
  if (status === '待上课') return 'blue'
  return 'amber'
}

function timeOf(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间待定' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

function shortDate(value: string | null) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' }) : '近期'
}

function emptyPages<T>(): Promise<AllPages<T>> { return Promise.resolve({ items: [], totalItems: 0, truncated: false }) }
function emptyBookingDashboard(): Promise<BookingDashboard> { return Promise.resolve({ pending: [], pendingCount: 0, upcoming: [], openConflicts: [], openConflictCount: 0 }) }
