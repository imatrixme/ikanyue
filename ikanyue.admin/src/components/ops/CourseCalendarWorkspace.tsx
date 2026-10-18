import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { viewPaths } from '../../app/navigation'
import { calendarRange, normalizeDateKey, shiftCalendarDate, todayKey, visibleCalendarDays } from '../../app/calendarLogic'
import { calendarViewForContext, normalizeCalendarMode, schedulerLessonCode, selectionFromSlots, weeklyIntervals, type CalendarScheduleSelection, type CourseCalendarMode } from '../../app/calendarScheduler'
import type { CourseCalendarEntry, CourseCalendarResponse, CourseCalendarView } from '../../app/calendarTypes'
import type { CourseSpec, Lesson, TeachingClass } from '../../app/courseTypes'
import type { OpsProfile } from '../../app/types'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { IconButton } from '../ui/Controls'
import { AsyncState, EmptyState } from '../ui/DataDisplay'
import { CourseCalendarDrawer } from './CourseCalendarDrawer'
import { CourseCalendarToolbar } from './CourseCalendarToolbar'
import { CourseCalendarViews } from './CourseCalendarViews'
import { CourseScheduleDrawer, type CourseScheduleInput } from './CourseScheduleDrawer'
import { VisualCourseScheduler } from './VisualCourseScheduler'

interface Props { api: OpsApi; profile: OpsProfile; token: string }

export function CourseCalendarWorkspace({ api, profile, token }: Props) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const capabilities = profile.courseCreditCapabilities || []
  const canAcademic = profile.isAdmin || capabilities.includes('course_credit.academic')
  const teacherOnly = !canAcademic && capabilities.includes('course_credit.teacher')
  const searchKey = searchParams.toString()
  const mode = normalizeCalendarMode(searchParams.get('mode'), teacherOnly)
  const view = calendarViewForContext(searchParams.get('view'), mode, teacherOnly)
  const dateKey = normalizeDateKey(searchParams.get('date'))
  const filters = useMemo(() => {
    const params = new URLSearchParams(searchKey)
    return Object.fromEntries(filterNames.map((name) => [name, teacherOnly && name === 'teacherId' ? '' : params.get(name) || '']))
  }, [searchKey, teacherOnly])
  const range = useMemo(() => calendarRange(view, dateKey), [view, dateKey])
  const query = useMemo(() => ({ ...range, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }), [filters, range])
  const [data, setData] = useState<CourseCalendarResponse | null>(null)
  const [classes, setClasses] = useState<TeachingClass[]>([])
  const [courses, setCourses] = useState<CourseSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [selected, setSelected] = useState<CourseCalendarEntry | null>(null)
  const [detail, setDetail] = useState<Lesson | null>(null)
  const [selection, setSelection] = useState<CalendarScheduleSelection | null>(null)
  const [actionError, setActionError] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleNotice, setScheduleNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const next = await api.getCourseCalendar(token, query); setData(next); return next }
    catch (loadError) { setError(message(loadError, teacherOnly ? '加载我的课表失败' : '加载机构课表失败')) }
    finally { setLoading(false) }
  }, [api, query, teacherOnly, token])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    if (!canAcademic) return
    const timeout = window.setTimeout(() => {
      setReferenceError('')
      void Promise.all([
        api.listCourseResource<TeachingClass>(token, 'classes', { page: 1, perPage: 100, status: 'active' }),
        api.listCourseResource<CourseSpec>(token, 'courseSpecs', { page: 1, perPage: 100, status: 'active' }),
      ]).then(([classPage, coursePage]) => { setClasses(classPage.items); setCourses(coursePage.items) })
        .catch((loadError) => setReferenceError(message(loadError, '加载排课选项失败')))
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [api, canAcademic, token])

  useEffect(() => {
    if (!canAcademic || mode !== 'schedule' || view !== 'week' || filters.teacherId || !data?.facets.teachers[0]) return
    const next = new URLSearchParams(searchParams)
    next.set('teacherId', data.facets.teachers[0].id)
    setSearchParams(next, { replace: true })
  }, [canAcademic, data?.facets.teachers, filters.teacherId, mode, searchParams, setSearchParams, view])

  function setParam(name: string, value: string, replace = true) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value); else next.delete(name)
    setSearchParams(next, { replace })
  }

  function setMode(nextMode: CourseCalendarMode) {
    const next = new URLSearchParams(searchParams)
    next.set('mode', nextMode)
    next.set('view', calendarViewForContext(null, nextMode, false))
    if (nextMode === 'browse') next.delete('teacherId')
    setSearchParams(next, { replace: true })
  }

  function resetFilters() {
    const next = new URLSearchParams(searchParams)
    filterNames.forEach((name) => next.delete(name))
    setSearchParams(next, { replace: true })
  }

  async function openEntry(entry: CourseCalendarEntry) {
    setSelected(entry); setDetail(null); setActionError('')
    if (teacherOnly) return
    try { setDetail(await api.getCourseResource<Lesson>(token, 'lessons', entry.lessonId)) }
    catch (detailError) { setActionError(message(detailError, '课堂详情暂时无法加载，仍可查看日历摘要。')) }
  }

  async function runAction(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setLoading(true); setActionError('')
    try { await action(); setSelected(null); await load(); return true }
    catch (actionFailure) {
      if (isVersionConflict(actionFailure)) {
        const refreshed = await load()
        const current = refreshed?.items.find((item) => item.lessonId === selected?.lessonId)
        if (current) setSelected(current)
        setActionError('课堂数据已变化，课表已刷新，请重新确认后操作。')
      } else setActionError(message(actionFailure, fallback))
      return false
    } finally { setLoading(false) }
  }

  function beginSchedule(next: CalendarScheduleSelection) {
    setScheduleError(''); setScheduleNotice(''); setSelection(next)
  }

  // Sessions carry teacher and class only after publication, so the scheduler publishes each lesson it creates.
  // A lesson whose publication fails is cancelled at once; earlier weeks stay published and are reported.
  async function saveSchedule(input: CourseScheduleInput) {
    if (!selection) return
    const intervals = weeklyIntervals({ ...selection, startAt: input.startAt, endAt: input.endAt }, input.repeatCount)
    const published: string[] = []
    setLoading(true); setScheduleError(''); setScheduleNotice('')
    try {
      for (const interval of intervals) {
        const created = await api.createCourseResource(token, 'lessons', {
          code: schedulerLessonCode(interval.startAt, input.teacherId),
          endAt: interval.endAt,
          location: input.location,
          originType: 'admin',
          requiredCreditTypeId: input.requiredCreditTypeId,
          requiredQuantity: input.requiredQuantity,
          startAt: interval.startAt,
          status: 'draft',
          title: input.title,
        })
        try {
          await api.publishLesson(token, created.id, [input.classId], [{ teacherId: input.teacherId, role: 'lead' }])
        } catch (publishError) {
          await api.setCourseResourceStatus(token, 'lessons', created.id, 'cancelled', '排课发布失败，自动撤销').catch(() => undefined)
          throw publishError
        }
        published.push(dayLabel(interval.startAt))
      }
      setScheduleNotice(`已发布 ${published.length} 节课堂`)
      setSelection(null)
      await load()
    } catch (saveError) {
      const done = published.length ? `已发布 ${published.join('、')}；` : ''
      setScheduleError(`${done}第 ${published.length + 1} 节未发布：${message(saveError, '排课失败')}。其余日期未创建。`)
      await load()
    } finally { setLoading(false) }
  }

  const items = data?.items || []
  const teachers = data?.facets.teachers || []
  const activeTeacher = teacherOnly
    ? { id: profile.id, name: profile.realName || profile.nickName || '当前教师' }
    : teachers.find((teacher) => teacher.id === filters.teacherId)
  const showScheduler = mode === 'schedule' && canAcademic && view === 'day'
  const canSelectWeekSlot = mode === 'schedule' && canAcademic && view === 'week' && activeTeacher
  const title = teacherOnly ? '我的周排程' : mode === 'schedule' ? '排课日历' : '机构课表'

  return <WorkspacePanel>
    <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label={teacherOnly ? '刷新我的课表' : '刷新机构课表'} onClick={() => void load()} type="button" />{canAcademic && mode === 'schedule' && teachers[0] ? <IconButton icon={<Plus className="h-4 w-4" />} label="新增排课" onClick={() => beginSchedule(selectionFromSlots(dateKey, activeTeacher || teachers[0], 2))} type="button" variant="primary" /> : null}</>} title={title} />
    <CourseCalendarToolbar dateLabel={calendarDateLabel(view, dateKey)} facets={data?.facets} filters={filters} mode={mode} onFilter={setParam} onMode={setMode} onReset={resetFilters} onShift={(direction) => setParam('date', shiftCalendarDate(view, dateKey, direction))} onToday={() => setParam('date', todayKey())} onView={(nextView: CourseCalendarView) => setParam('view', nextView)} teacherOnly={teacherOnly} view={view} />
    {scheduleNotice ? <p className="border-b border-[var(--success)]/30 bg-[var(--success)]/10 px-5 py-2 text-sm text-[var(--success)]" role="status">{scheduleNotice}</p> : null}
    {referenceError ? <p className="border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-2 text-sm text-[var(--destructive)]" role="alert">{referenceError}</p> : null}
    <AsyncState empty={mode === 'browse' && !items.length ? <EmptyState filtered={Object.values(filters).some(Boolean)} noun="课程安排" onReset={resetFilters} /> : undefined} error={error} loading={loading && !data} loadingLabel="正在加载课程日历..." onRetry={() => void load()}>
      {showScheduler ? <><div className="hidden md:block"><VisualCourseScheduler dateKey={dateKey} entries={items} onOpen={(entry) => void openEntry(entry)} onSelect={beginSchedule} teachers={teachers} /></div><div className="md:hidden"><CourseCalendarViews dateKey={dateKey} days={[dateKey]} entries={items} onOpen={(entry) => void openEntry(entry)} view="list" /></div></> : <CourseCalendarViews dateKey={dateKey} days={visibleCalendarDays(view, dateKey)} entries={items} onOpen={(entry) => void openEntry(entry)} onSelectSlot={canSelectWeekSlot ? (day, slot) => beginSchedule(selectionFromSlots(day, activeTeacher, slot)) : undefined} view={view} />}
    </AsyncState>
    {selection ? <CourseScheduleDrawer classes={classes} courses={courses} entries={items} error={scheduleError} key={`${selection.teacherId}:${selection.startAt}`} loading={loading} onClose={() => setSelection(null)} onSubmit={saveSchedule} selection={selection} /> : null}
    {selected ? <CourseCalendarDrawer canManage={canAcademic} detail={detail} entry={selected} error={actionError} loading={loading} onCancel={(reason) => runAction(() => api.cancelLesson(token, selected.lessonId, reason), '取消课堂失败')} onClose={() => setSelected(null)} onOpenLesson={() => navigate(`${viewPaths.lessons}?sessionId=${encodeURIComponent(selected.lessonId)}`)} onReschedule={(startAt, endAt, reason) => runAction(() => api.rescheduleLesson(token, selected.lessonId, startAt, endAt, reason), '调整课堂时间失败')} /> : null}
  </WorkspacePanel>
}

function calendarDateLabel(view: CourseCalendarView, dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  if (view === 'month') return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`
  if (view === 'week') { const days = visibleCalendarDays(view, dateKey); return `${days[0].slice(5).replace('-', '/')} - ${days[6].slice(5).replace('-', '/')}` }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
}

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' })
}

function isVersionConflict(error: unknown) { return error instanceof Error && /版本|冲突|version|conflict/i.test(error.message) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
const filterNames = ['teacherId', 'studentId', 'classId', 'courseSpecId', 'status', 'originType']
