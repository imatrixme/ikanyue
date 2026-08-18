import { useState } from 'react'
import type { Lesson } from '../../app/courseTypes'
import type { CourseCalendarEntry } from '../../app/calendarTypes'
import {
  calendarOriginLabel, calendarStatusLabel, shanghaiLocalInput, shanghaiLocalInputToIso,
} from '../../app/calendarLogic'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Controls'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field } from '../ui/Input'
import { Input } from '../ui/Input'

interface Props {
  canManage?: boolean
  detail: Lesson | null
  entry: CourseCalendarEntry
  error?: string
  loading: boolean
  onCancel: (reason: string) => Promise<boolean>
  onClose: () => void
  onOpenLesson: () => void
  onReschedule: (startAt: string, endAt: string, reason: string) => Promise<boolean>
}

export function CourseCalendarDrawer(props: Props) {
  const [action, setAction] = useState<'cancel' | 'reschedule' | null>(null)
  const editable = props.canManage !== false && !['cancelled', 'settled'].includes(props.entry.rawStatus)
  return <>{!action ? <DrawerShell description={`${formatDateTime(props.entry.startAt)} · ${props.entry.location || '地点待定'}`} onRequestClose={props.onClose} size="wide" title={props.entry.title}><div className="grid gap-6 p-5"><div className="flex flex-wrap items-center gap-2"><Badge tone={props.entry.rawStatus === 'cancelled' ? 'red' : 'blue'}>{calendarStatusLabel(props.entry.rawStatus)}</Badge><Badge tone="neutral">{calendarOriginLabel(props.entry.originType)}</Badge>{props.entry.adjusted ? <Badge tone="amber">已改期</Badge> : null}{props.entry.attention ? <Badge tone="amber">{props.entry.attention}</Badge> : null}</div>{props.error ? <ActionError message={props.error} /> : null}<dl className="grid gap-px overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2"><Fact label="课程" value={props.entry.course.name} /><Fact label="教师" value={props.entry.teacherSummary.label || '待安排'} /><Fact label="班级" value={props.entry.classSummary.label || '一对一课程'} /><Fact label="学员" value={props.entry.participantSummary.label || `${props.entry.participantSummary.count} 名`} /><Fact label="时间" value={formatRange(props.entry)} /><Fact label="地点" value={props.entry.location || '待安排'} /><Fact label="课堂版本" value={`V${props.detail?.version || props.entry.version}`} /><Fact label="课堂编号" value={props.entry.lessonId} /></dl><div className="flex flex-wrap gap-2"><Button onClick={props.onOpenLesson} type="button">进入课堂管理</Button>{editable ? <Button disabled={props.loading} onClick={() => setAction('reschedule')} type="button" variant="secondary">调整时间</Button> : null}{editable ? <Button disabled={props.loading} onClick={() => setAction('cancel')} type="button" variant="danger">取消课堂</Button> : null}</div></div></DrawerShell> : null}{action === 'reschedule' ? <RescheduleDialog entry={props.entry} error={props.error} loading={props.loading} onClose={() => setAction(null)} onSave={props.onReschedule} /> : null}{action === 'cancel' ? <CancelDialog error={props.error} loading={props.loading} onClose={() => setAction(null)} onSave={props.onCancel} /> : null}</>
}

function RescheduleDialog({ entry, error, loading, onClose, onSave }: { entry: CourseCalendarEntry; error?: string; loading: boolean; onClose: () => void; onSave: (startAt: string, endAt: string, reason: string) => Promise<boolean> }) {
  const [startAt, setStartAt] = useState(shanghaiLocalInput(entry.startAt))
  const [endAt, setEndAt] = useState(shanghaiLocalInput(entry.endAt))
  const [reason, setReason] = useState('教学安排调整')
  const valid = startAt && endAt && endAt > startAt && reason.trim().length >= 2
  return <DialogShell description="提交前服务端会重新检查版本与时间冲突。" onRequestClose={onClose} size="compact" title="调整课堂时间"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (valid) void onSave(shanghaiLocalInputToIso(startAt), shanghaiLocalInputToIso(endAt), reason.trim()).then((saved) => { if (saved) onClose() }) }}>{error ? <ActionError message={error} /> : null}<Field label="新开始时间"><Input aria-label="新开始时间" onChange={(event) => setStartAt(event.target.value)} required type="datetime-local" value={startAt} /></Field><Field label="新结束时间"><Input aria-label="新结束时间" onChange={(event) => setEndAt(event.target.value)} required type="datetime-local" value={endAt} /></Field><Field label="调整原因"><Textarea aria-label="调整原因" minLength={2} onChange={(event) => setReason(event.target.value)} required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading || !valid} type="submit">确认调整</Button></div></form></DialogShell>
}

function CancelDialog({ error, loading, onClose, onSave }: { error?: string; loading: boolean; onClose: () => void; onSave: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState('教学安排取消')
  return <DialogShell description="取消后课堂不会再出现在学员和教师的有效日程中。" onRequestClose={onClose} size="compact" title="取消课堂"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 2) void onSave(reason.trim()).then((saved) => { if (saved) onClose() }) }}>{error ? <ActionError message={error} /> : null}<Field label="取消原因"><Textarea aria-label="取消原因" minLength={2} onChange={(event) => setReason(event.target.value)} required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">返回</Button><Button disabled={loading || reason.trim().length < 2} type="submit" variant="danger">确认取消</Button></div></form></DialogShell>
}

function ActionError({ message }: { message: string }) { return <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">{message}</p> }
function Fact({ label, value }: { label: string; value: string }) { return <div className="bg-[var(--card)] px-3 py-3"><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div> }
function formatDateTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '时间待定' }
function formatRange(entry: CourseCalendarEntry) { return `${formatDateTime(entry.startAt)} 至 ${entry.endAt ? new Date(entry.endAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }) : '待定'}` }
