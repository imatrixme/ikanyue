import { Ban, CalendarDays, CheckCircle2, Eye, RotateCw, XCircle } from 'lucide-react'
import { useState } from 'react'

import type { BookingAppointment, BookingAppointmentDetail } from '../../app/bookingTypes'
import { SectionHeader } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { SegmentedControl, Textarea } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, Pagination, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'

export type AppointmentDisplayMode = 'list' | 'calendar'

interface AppointmentListProps {
  appointments: BookingAppointment[]
  error: string
  filtered?: boolean
  loading: boolean
  mode: AppointmentDisplayMode
  onModeChange: (mode: AppointmentDisplayMode) => void
  onOpen: (appointment: BookingAppointment) => void
  onPageChange: (page: number) => void
  onReset?: () => void
  page: number
  totalItems: number
  totalPages: number
}

export function BookingAppointmentList({ appointments, error, filtered = false, loading, mode, onModeChange, onOpen, onPageChange, onReset, page, totalItems, totalPages }: AppointmentListProps) {
  const empty = appointments.length === 0 ? <EmptyState filtered={filtered} noun="预约记录" onReset={onReset} /> : undefined
  return (
    <div>
      <div className="flex justify-end border-b border-[var(--border)] px-4 py-3">
        <SegmentedControl label="预约展示方式" onChange={onModeChange} options={[
          { label: '列表', value: 'list' },
          { label: '日程', value: 'calendar' },
        ]} value={mode} />
      </div>
      <AsyncState empty={empty} error={error} loading={loading && appointments.length === 0} loadingLabel="正在加载预约...">
        {mode === 'list'
          ? <ResponsiveDataRegion desktop={<AppointmentTable appointments={appointments} onOpen={onOpen} />} mobile={appointments.map((item) => <AppointmentCard appointment={item} key={item.appointmentId} onOpen={() => onOpen(item)} />)} />
          : <AppointmentCalendar appointments={appointments} onOpen={onOpen} />}
      </AsyncState>
      <Pagination onPageChange={onPageChange} page={page} totalItems={totalItems} totalPages={totalPages} />
    </div>
  )
}

function AppointmentTable({ appointments, onOpen }: { appointments: BookingAppointment[]; onOpen: (appointment: BookingAppointment) => void }) {
  return (
    <DataTable>
      <thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">课程与学员</th><th className="px-4 py-3">教师</th><th className="px-4 py-3">预约时间</th><th className="px-4 py-3">地点</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
      <tbody>{appointments.map((item) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={item.appointmentId}><td className="px-4 py-3"><p className="font-semibold">{item.course.name}</p><p className="text-xs text-[var(--muted-foreground)]">{item.student.name}</p></td><td className="px-4 py-3">{item.teacher.name}</td><td className="px-4 py-3"><p>{formatDate(item.startAt)}</p><p className="text-xs text-[var(--muted-foreground)]">{formatTimeRange(item.startAt, item.endAt)}</p></td><td className="px-4 py-3">{item.location || '待确认'}</td><td className="px-4 py-3"><BookingStatusBadge status={item.status} /></td><td className="px-4 py-3 text-right"><Button icon={<Eye className="h-4 w-4" />} onClick={() => onOpen(item)} type="button" variant="secondary">查看</Button></td></tr>)}</tbody>
    </DataTable>
  )
}

function AppointmentCard({ appointment, onOpen }: { appointment: BookingAppointment; onOpen: () => void }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{appointment.course.name}</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">{appointment.student.name} · {appointment.teacher.name}</p></div><BookingStatusBadge status={appointment.status} /></div><div className="text-sm"><p>{formatDate(appointment.startAt)} {formatTimeRange(appointment.startAt, appointment.endAt)}</p><p className="mt-1 text-[var(--muted-foreground)]">{appointment.location || '地点待确认'}</p></div><Button onClick={onOpen} type="button" variant="secondary">预约详情</Button></article>
}

function AppointmentCalendar({ appointments, onOpen }: { appointments: BookingAppointment[]; onOpen: (appointment: BookingAppointment) => void }) {
  const groups = groupByDate(appointments)
  return <div className="divide-y divide-[var(--border)]">{groups.map(([date, items]) => <section className="grid gap-3 px-4 py-5 sm:grid-cols-[10rem_1fr]" key={date}><div><p className="text-sm font-semibold">{formatDate(items[0].startAt)}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{items.length} 个预约</p></div><div className="grid gap-2">{items.map((item) => <button className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-left transition hover:border-[var(--brand-border)] hover:bg-[var(--brand-wash)] sm:grid-cols-[7rem_1fr_auto] sm:items-center" key={item.appointmentId} onClick={() => onOpen(item)} type="button"><span className="font-semibold tabular-nums">{formatTimeRange(item.startAt, item.endAt)}</span><span><span className="block font-medium">{item.course.name}</span><span className="text-xs text-[var(--muted-foreground)]">{item.student.name} · {item.teacher.name}</span></span><BookingStatusBadge status={item.status} /></button>)}</div></section>)}</div>
}

interface DetailProps {
  detail: BookingAppointmentDetail
  loading: boolean
  onCancel: () => void
  onClose: () => void
  onConfirm: () => void
  onDecline: () => void
  onLesson: (lessonId: string) => void
  onReschedule: () => void
}

export function BookingAppointmentDrawer({ detail, loading, onCancel, onClose, onConfirm, onDecline, onLesson, onReschedule }: DetailProps) {
  const editable = ['confirmed', 'rescheduled'].includes(detail.status)
  return (
    <DrawerShell description={`${formatDate(detail.startAt)} ${formatTimeRange(detail.startAt, detail.endAt)}`} onRequestClose={onClose} size="wide" title={`${detail.course.name}预约`}>
      <div className="grid gap-6 p-5">
        <div className="flex flex-wrap items-center gap-2"><BookingStatusBadge status={detail.status} />{detail.canConfirm ? <Button disabled={loading} icon={<CheckCircle2 className="h-4 w-4" />} onClick={onConfirm} type="button">代教师确认</Button> : null}{detail.canDecline ? <Button disabled={loading} icon={<Ban className="h-4 w-4" />} onClick={onDecline} type="button" variant="danger">拒绝预约</Button> : null}{detail.lessonId ? <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => onLesson(detail.lessonId)} type="button" variant="secondary">关联课堂</Button> : null}{editable ? <Button disabled={loading} icon={<RotateCw className="h-4 w-4" />} onClick={onReschedule} type="button" variant="secondary">调整时间</Button> : null}{editable ? <Button disabled={loading} icon={<XCircle className="h-4 w-4" />} onClick={onCancel} type="button" variant="danger">取消预约</Button> : null}</div>
        <section className="grid gap-3"><SectionHeader title="预约信息" /><dl className="grid gap-px overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2"><DetailItem label="学员" value={detail.student.name} /><DetailItem label="教师" value={detail.teacher.name} /><DetailItem label="地点" value={detail.location || '待确认'} /><DetailItem label="响应截止" value={formatDateTime(detail.responseDeadline)} /><DetailItem label="学员备注" value={detail.note || '无'} /><DetailItem label="处理说明" value={detail.responseReason || '无'} /></dl></section>
        <section className="grid gap-3"><SectionHeader description="按发生顺序保留申请、确认、改期和取消记录。" title="处理记录" />{detail.events.length ? <div className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">{detail.events.map((event) => <div className="grid gap-1 px-3 py-3 sm:grid-cols-[9rem_1fr]" key={event.id}><div><p className="text-sm font-semibold">{bookingEventLabel(event.eventType)}</p><p className="text-xs text-[var(--muted-foreground)]">{formatDateTime(event.created)}</p></div><div className="text-sm"><p>{event.fromStatus ? `${bookingStatusLabel(event.fromStatus)} → ` : ''}{bookingStatusLabel(event.toStatus)}</p><p className="text-xs text-[var(--muted-foreground)]">{event.reason || actorLabel(event.actorRole)}</p></div></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">暂无处理记录。</p>}</section>
        <section className="grid gap-3"><SectionHeader description="用于防止教师或学员在同一时间重复排课。" title="时间占用明细" />{detail.claims.length ? <div className="grid gap-2">{detail.claims.map((claim) => <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm" key={claim.id}><div><p className="font-medium">{claimOwnerLabel(claim.ownerType)}</p><p className="text-xs text-[var(--muted-foreground)]">{formatTimeRange(claim.cellStartAt, claim.cellEndAt)}</p></div><Badge tone={claim.status === 'active' ? 'green' : 'neutral'}>{claim.status === 'active' ? '占用中' : '已释放'}</Badge></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">待确认预约不会占用时间。</p>}</section>
      </div>
    </DrawerShell>
  )
}

export function BookingConfirmDialog({ loading, onClose, onConfirm }: { loading: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  return <DialogShell description="确认后将立即创建正式课堂、预留学员课时，并占用教师与学员时间。" onRequestClose={onClose} size="compact" title="代教师确认预约"><div className="grid gap-4 p-5"><p className="text-sm text-[var(--muted-foreground)]">请确认教师已经接受本次预约安排。</p><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void onConfirm()} type="button">确认预约</Button></div></div></DialogShell>
}

export function BookingDeclineDialog({ loading, onClose, onConfirm }: { loading: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  return <DialogShell description="拒绝后预约将关闭，学员可以重新选择其他教师或时间。" onRequestClose={onClose} size="compact" title="拒绝预约"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 2) void onConfirm(reason.trim()) }}><Field htmlFor="booking-decline-reason" label="拒绝原因"><Textarea id="booking-decline-reason" minLength={2} onChange={(event) => setReason(event.target.value)} placeholder="说明无法接受本次预约的原因" required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading || reason.trim().length < 2} type="submit" variant="danger">确认拒绝</Button></div></form></DialogShell>
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--card)] px-3 py-3"><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>
}

export function BookingCancelDialog({ loading, onClose, onConfirm }: { loading: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('教务调整课程安排')
  return <DialogShell description="取消后会释放课堂课时预留与教师、学员时间占用。" onRequestClose={onClose} size="compact" title="取消预约"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 2) void onConfirm(reason.trim()) }}><Field htmlFor="booking-cancel-reason" label="取消原因"><Textarea id="booking-cancel-reason" minLength={2} onChange={(event) => setReason(event.target.value)} required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading || reason.trim().length < 2} type="submit" variant="danger">确认取消</Button></div></form></DialogShell>
}

export function BookingRescheduleDialog({ appointment, loading, onClose, onConfirm }: { appointment: BookingAppointmentDetail; loading: boolean; onClose: () => void; onConfirm: (startAt: string, endAt: string, reason: string) => Promise<void> }) {
  const [startAt, setStartAt] = useState(toLocalInput(appointment.startAt))
  const [endAt, setEndAt] = useState(toLocalInput(appointment.endAt))
  const [reason, setReason] = useState('教务调整课程时间')
  const valid = Date.parse(startAt) < Date.parse(endAt) && reason.trim().length >= 2
  return <DialogShell description="提交前会重新检查教师、学员时间与可用课时，发生冲突时原预约保持不变。" onRequestClose={onClose} size="compact" title="调整预约时间"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (valid) void onConfirm(new Date(startAt).toISOString(), new Date(endAt).toISOString(), reason.trim()) }}><Field htmlFor="booking-reschedule-start" label="新开始时间"><Input id="booking-reschedule-start" onChange={(event) => setStartAt(event.target.value)} required type="datetime-local" value={startAt} /></Field><Field htmlFor="booking-reschedule-end" label="新结束时间"><Input id="booking-reschedule-end" onChange={(event) => setEndAt(event.target.value)} required type="datetime-local" value={endAt} /></Field><Field htmlFor="booking-reschedule-reason" label="调整原因"><Textarea id="booking-reschedule-reason" minLength={2} onChange={(event) => setReason(event.target.value)} required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading || !valid} type="submit">确认调整</Button></div></form></DialogShell>
}

export function BookingStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{bookingStatusLabel(status)}</Badge>
}

function bookingStatusLabel(status: string) {
  return ({ pending: '待确认', confirmed: '已确认', declined: '已拒绝', withdrawn: '学员已撤回', expired: '已过期', slot_taken: '时段已被占用', eligibility_lost: '课时已不可用', cancelled: '已取消', rescheduled: '已改期', fulfilled: '已完成' } as Record<string, string>)[status] || status
}

function statusTone(status: string): 'neutral' | 'green' | 'amber' | 'red' | 'blue' {
  if (['confirmed', 'fulfilled'].includes(status)) return 'green'
  if (['pending', 'rescheduled'].includes(status)) return 'amber'
  if (['declined', 'cancelled', 'slot_taken', 'eligibility_lost'].includes(status)) return 'red'
  return 'neutral'
}

function bookingEventLabel(type: string) {
  return ({ requested: '发起预约', confirmed: '确认预约', declined: '拒绝预约', withdrawn: '学员撤回', expired: '等待超时', slot_taken: '时段冲突', eligibility_lost: '课时失效', cancelled: '取消预约', rescheduled: '调整时间', fulfilled: '完成课程' } as Record<string, string>)[type] || type
}

function actorLabel(role: string) { return ({ student: '学员操作', teacher: '教师操作', admin: '教务操作', worker: '系统任务' } as Record<string, string>)[role] || role }
function claimOwnerLabel(type: string) { return type === 'teacher' ? '教师时间' : type === 'student' ? '学员时间' : '教室时间' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }) }
function formatDateTime(value?: string | null) { if (!value) return '无'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }) }
function formatTimeRange(startAt: string, endAt: string) { const format = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); return `${format(startAt)}-${format(endAt)}` }
function groupByDate(items: BookingAppointment[]) { const groups = new Map<string, BookingAppointment[]>(); items.forEach((item) => { const key = item.startAt.slice(0, 10); groups.set(key, [...(groups.get(key) || []), item]) }); return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)) }
function toLocalInput(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value.slice(0, 16); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16) }
