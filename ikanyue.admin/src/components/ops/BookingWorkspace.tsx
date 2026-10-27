import { Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { viewPaths } from '../../app/navigation'
import type { BookingAppointment, BookingAppointmentDetail, BookingReferenceData } from '../../app/bookingTypes'
import { FilterToolbar, PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Button } from '../ui/Button'
import { useNotify } from '../ui/notifyContext'
import { IconButton } from '../ui/Controls'
import { Tabs } from '../ui/DataDisplay'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { BookingAppointmentDrawer, BookingAppointmentList, BookingCancelDialog, BookingConfirmDialog, BookingDeclineDialog, BookingRescheduleDialog, type AppointmentDisplayMode } from './BookingAppointmentViews'
import { BookingConfigurationViews } from './BookingConfigurationViews'
import { OperatorBookingDialog } from './OperatorBookingDialog'

type BookingTab = 'appointments' | 'configuration'
const emptyReferences: BookingReferenceData = { teachers: [], courses: [], creditTypes: [], policies: [] }

export function BookingWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  const [references, setReferences] = useState<BookingReferenceData>(emptyReferences)
  const [appointments, setAppointments] = useState<BookingAppointment[]>([])
  const [detail, setDetail] = useState<BookingAppointmentDetail | null>(null)
  const [decisionDialog, setDecisionDialog] = useState<'confirm' | 'decline' | null>(null)
  const [cancelDialog, setCancelDialog] = useState(false)
  const [rescheduleDialog, setRescheduleDialog] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pageInfo, setPageInfo] = useState({ page: 1, totalItems: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const notify = useNotify()
  const [error, setError] = useState('')

  const tab = bookingTab(searchParams.get('tab'))
  const mode = displayMode(searchParams.get('mode'))
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const status = searchParams.get('status') || ''
  const teacherId = searchParams.get('teacherId') || ''
  const courseSpecId = searchParams.get('courseSpecId') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''

  const loadSummary = useCallback(async () => {
    try { setReferences(await api.getBookingReferenceData(token)) }
    catch (loadError) { setError(message(loadError, '加载课程与教师失败')) }
  }, [api, token])

  const query = useMemo(() => ({
    page, perPage: 20, status, teacherId, courseSpecId,
    from: from ? new Date(`${from}T00:00:00+08:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59+08:00`).toISOString() : undefined,
  }), [courseSpecId, from, page, status, teacherId, to])

  const loadAppointments = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await api.listBookingAppointments(token, query)
      setAppointments(result.items)
      setPageInfo({ page: result.page, totalItems: result.totalItems, totalPages: result.totalPages })
    } catch (loadError) { setError(message(loadError, '加载预约列表失败')) }
    finally { setLoading(false) }
  }, [api, query, token])

  useEffect(() => { searchParamsRef.current = searchParams }, [searchParams])
  useEffect(() => { const timer = window.setTimeout(() => void loadSummary(), 0); return () => window.clearTimeout(timer) }, [loadSummary])
  useEffect(() => { if (tab !== 'appointments') return; const timer = window.setTimeout(() => void loadAppointments(), 0); return () => window.clearTimeout(timer) }, [loadAppointments, tab])

  function setParam(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(searchParamsRef.current)
    if (value) next.set(key, value); else next.delete(key)
    if (resetPage && key !== 'page') next.delete('page')
    searchParamsRef.current = next
    setSearchParams(next)
  }

  async function openAppointment(item: BookingAppointment) {
    setLoading(true); setError('')
    try { setDetail(await api.getBookingAppointment(token, item.appointmentId)) }
    catch (loadError) { setError(message(loadError, '加载预约详情失败')) }
    finally { setLoading(false) }
  }
  async function cancelAppointment(reason: string) {
    if (!detail) return
    await runAction(async () => api.cancelBookingAppointment(token, detail.appointmentId, reason), '取消预约失败', '预约已取消')
  }
  async function confirmAppointment() {
    if (!detail) return
    await runAction(async () => api.confirmBookingAppointment(token, detail.appointmentId), '确认预约失败', '预约已确认')
  }
  async function declineAppointment(reason: string) {
    if (!detail) return
    await runAction(async () => api.declineBookingAppointment(token, detail.appointmentId, reason), '拒绝预约失败', '已拒绝预约')
  }
  async function rescheduleAppointment(startAt: string, endAt: string, reason: string) {
    if (!detail) return
    await runAction(async () => api.rescheduleBookingAppointment(token, detail.appointmentId, startAt, endAt, reason), '调整预约时间失败', '预约时间已调整')
  }
  async function runAction(action: () => Promise<unknown>, fallback: string, success: string) {
    setLoading(true); setError('')
    try {
      await action(); setDecisionDialog(null); setCancelDialog(false); setRescheduleDialog(false); setDetail(null); notify(success)
      await Promise.all([loadAppointments(), loadSummary()])
    } catch (actionError) { setError(message(actionError, fallback)); setLoading(false) }
  }
  function clearFilters() {
    const next = new URLSearchParams(searchParamsRef.current)
    for (const key of ['status', 'teacherId', 'courseSpecId', 'from', 'to', 'page']) next.delete(key)
    searchParamsRef.current = next
    setSearchParams(next)
  }

  const hasFilters = Boolean(status || teacherId || courseSpecId || from || to)
  const visibleDetail = detail && !decisionDialog && !cancelDialog && !rescheduleDialog ? detail : null
  // Conflict migration moved to 高级设置 → 预约规则; old links land there.
  if (searchParams.get('tab') === 'conflicts') return <Navigate replace to={`${viewPaths.bookingSettings}?tab=conflicts`} />
  return <WorkspacePanel><PageHeader actions={<><Button icon={<Plus className="h-4 w-4" />} onClick={() => setBookingOpen(true)} type="button">代约一对一</Button><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新预约工作区" onClick={() => { void loadSummary(); if (tab === 'appointments') void loadAppointments() }} type="button" /></>} title="课程预约" /><div className="px-4 sm:px-5"><Tabs label="预约工作区" onChange={(value) => setParam('tab', value, false)} options={[{ label: '预约队列', value: 'appointments' }, { label: '开放配置', value: 'configuration' }]} value={tab} /></div>{error && tab !== 'appointments' ? <p className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--destructive)]">{error}</p> : null}{tab === 'appointments' ? <><FilterToolbar className="sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"><Field htmlFor="booking-status-filter" label="预约状态"><Select allowEmpty id="booking-status-filter" onChange={(event) => setParam('status', event.target.value)} options={statusOptions} placeholder="全部状态" value={status} /></Field><Field htmlFor="booking-teacher-filter" label="教师"><Select allowEmpty id="booking-teacher-filter" onChange={(event) => setParam('teacherId', event.target.value)} options={references.teachers.map((item) => ({ label: item.name, value: item.id }))} placeholder="全部教师" value={teacherId} /></Field><Field htmlFor="booking-course-filter" label="课程"><Select allowEmpty id="booking-course-filter" onChange={(event) => setParam('courseSpecId', event.target.value)} options={references.courses.map((item) => ({ label: item.name, value: item.id }))} placeholder="全部课程" value={courseSpecId} /></Field><Field htmlFor="booking-from-filter" label="开始日期"><Input id="booking-from-filter" onChange={(event) => setParam('from', event.target.value)} type="date" value={from} /></Field><Field htmlFor="booking-to-filter" label="结束日期"><Input id="booking-to-filter" min={from || undefined} onChange={(event) => setParam('to', event.target.value)} type="date" value={to} /></Field><Button className="self-end" disabled={!hasFilters} icon={<RotateCcw className="h-4 w-4" />} onClick={clearFilters} type="button" variant="secondary">重置</Button></FilterToolbar><BookingAppointmentList appointments={appointments} error={error} filtered={hasFilters} loading={loading} mode={mode} onModeChange={(value) => setParam('mode', value, false)} onOpen={(item) => void openAppointment(item)} onPageChange={(value) => setParam('page', String(value), false)} onReset={clearFilters} page={pageInfo.page} totalItems={pageInfo.totalItems} totalPages={pageInfo.totalPages} /></> : null}{tab === 'configuration' ? <BookingConfigurationViews api={api} referenceData={references} sections={['offerings', 'availability']} token={token} /> : null}{visibleDetail ? <BookingAppointmentDrawer detail={visibleDetail} loading={loading} onCancel={() => setCancelDialog(true)} onClose={() => setDetail(null)} onConfirm={() => setDecisionDialog('confirm')} onDecline={() => setDecisionDialog('decline')} onLesson={(lessonId) => navigate(`${viewPaths.lessons}?sessionId=${encodeURIComponent(lessonId)}`)} onReschedule={() => setRescheduleDialog(true)} /> : null}{detail && decisionDialog === 'confirm' ? <BookingConfirmDialog loading={loading} onClose={() => setDecisionDialog(null)} onConfirm={confirmAppointment} /> : null}{detail && decisionDialog === 'decline' ? <BookingDeclineDialog loading={loading} onClose={() => setDecisionDialog(null)} onConfirm={declineAppointment} /> : null}{detail && cancelDialog ? <BookingCancelDialog loading={loading} onClose={() => setCancelDialog(false)} onConfirm={cancelAppointment} /> : null}{detail && rescheduleDialog ? <BookingRescheduleDialog appointment={detail} loading={loading} onClose={() => setRescheduleDialog(false)} onConfirm={rescheduleAppointment} /> : null}{bookingOpen ? <OperatorBookingDialog api={api} onBooked={() => { if (tab === 'appointments') void loadAppointments() }} onClose={() => setBookingOpen(false)} token={token} /> : null}</WorkspacePanel>
}

function bookingTab(value: string | null): BookingTab { return value === 'configuration' ? value : 'appointments' }
function displayMode(value: string | null): AppointmentDisplayMode { return value === 'calendar' ? 'calendar' : 'list' }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

const statusOptions = [
  { label: '待确认', value: 'pending' }, { label: '已确认 / 已改期', value: 'confirmed,rescheduled' },
  { label: '已完成', value: 'fulfilled' }, { label: '已取消', value: 'cancelled' },
  { label: '已拒绝', value: 'declined' }, { label: '已过期或失效', value: 'expired,slot_taken,eligibility_lost' },
]
