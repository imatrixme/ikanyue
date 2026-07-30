import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { calendarRange, normalizeCalendarView, normalizeDateKey, shiftCalendarDate, todayKey, visibleCalendarDays } from '../../app/calendarLogic'
import type { CourseCalendarEntry, CourseCalendarResponse, CourseCalendarView } from '../../app/calendarTypes'
import type { Lesson } from '../../app/courseTypes'
import { viewBusinessIcons } from '../../app/businessIcons'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { IconButton } from '../ui/Controls'
import { AsyncState, EmptyState } from '../ui/DataDisplay'
import { CourseCalendarDrawer } from './CourseCalendarDrawer'
import { CourseCalendarToolbar } from './CourseCalendarToolbar'
import { CourseCalendarViews } from './CourseCalendarViews'

export function CourseCalendarWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const view = normalizeCalendarView(searchParams.get('view'))
  const dateKey = normalizeDateKey(searchParams.get('date'))
  const filters = useMemo(() => {
    const params = new URLSearchParams(searchKey)
    return Object.fromEntries(filterNames.map((name) => [name, params.get(name) || '']))
  }, [searchKey])
  const range = useMemo(() => calendarRange(view, dateKey), [view, dateKey])
  const query = useMemo(() => ({ ...range, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }), [filters, range])
  const [data, setData] = useState<CourseCalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CourseCalendarEntry | null>(null)
  const [detail, setDetail] = useState<Lesson | null>(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const next = await api.getCourseCalendar(token, query); setData(next); return next }
    catch (loadError) { setError(message(loadError, '加载机构课表失败')) }
    finally { setLoading(false) }
  }, [api, query, token])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  function setParam(name: string, value: string, replace = true) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value); else next.delete(name)
    setSearchParams(next, { replace })
  }

  async function openEntry(entry: CourseCalendarEntry) {
    setSelected(entry); setDetail(null); setActionError('')
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
      }
      else setActionError(message(actionFailure, fallback))
      return false
    } finally { setLoading(false) }
  }

  const dateLabel = calendarDateLabel(view, dateKey)
  const items = data?.items || []
  return <WorkspacePanel><PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新机构课表" onClick={() => void load()} type="button" />} badge={<Badge tone={error ? 'red' : 'green'}>{items.length} 节课程</Badge>} description="在同一时间轴查看全机构课堂，并按教师、学员、班级、课程与来源筛选。" eyebrow="全盘排课" icon={viewBusinessIcons.calendar} title="机构课表" /><CourseCalendarToolbar dateLabel={dateLabel} facets={data?.facets} filters={filters} onFilter={setParam} onReset={() => { const next = new URLSearchParams(searchParams); filterNames.forEach((name) => next.delete(name)); setSearchParams(next, { replace: true }) }} onShift={(direction) => setParam('date', shiftCalendarDate(view, dateKey, direction))} onToday={() => setParam('date', todayKey())} onView={(nextView: CourseCalendarView) => setParam('view', nextView)} view={view} /><AsyncState empty={!items.length ? <EmptyState filtered={Object.values(filters).some(Boolean)} noun="课程安排" onReset={() => { const next = new URLSearchParams(searchParams); filterNames.forEach((name) => next.delete(name)); setSearchParams(next, { replace: true }) }} /> : undefined} error={error} loading={loading && !data} loadingLabel="正在加载机构课表..." onRetry={() => void load()}><CourseCalendarViews dateKey={dateKey} days={visibleCalendarDays(view, dateKey)} entries={items} onOpen={(entry) => void openEntry(entry)} view={view} /></AsyncState>{selected ? <CourseCalendarDrawer detail={detail} entry={selected} error={actionError} loading={loading} onCancel={(reason) => runAction(() => api.setCourseResourceStatus(token, 'lessons', selected.lessonId, 'cancelled', reason), '取消课堂失败')} onClose={() => setSelected(null)} onOpenLesson={() => navigate(`/lessons?sessionId=${encodeURIComponent(selected.lessonId)}`)} onReschedule={(startAt, endAt, reason) => runAction(() => api.rescheduleLesson(token, selected.lessonId, startAt, endAt, reason), '调整课堂时间失败')} /> : null}</WorkspacePanel>
}

function calendarDateLabel(view: CourseCalendarView, dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  if (view === 'month') return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`
  if (view === 'week') { const days = visibleCalendarDays(view, dateKey); return `${days[0].slice(5).replace('-', '/')} - ${days[6].slice(5).replace('-', '/')}` }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
}

function isVersionConflict(error: unknown) { return error instanceof Error && /版本|冲突|version|conflict/i.test(error.message) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
const filterNames = ['teacherId', 'studentId', 'classId', 'courseSpecId', 'status', 'originType']
