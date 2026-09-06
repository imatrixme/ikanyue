import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingReferenceData } from '../../app/bookingTypes'
import { viewBusinessIcons } from '../../app/businessIcons'
import { creditEventLabel, formatDateTime, personName, recordName } from '../../app/coursePresentation'
import type { CourseRecord } from '../../app/courseTypes'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion, Tabs } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { Field, Input } from '../ui/Input'
import { TechnicalDetails } from '../ui/TechnicalDetails'

type WorkloadStatus = 'pending' | 'confirmed' | 'reversed'

export function TeacherWorkloadWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [status, setStatus] = useState<WorkloadStatus>('pending')
  const [items, setItems] = useState<CourseRecord[]>([])
  const [teachers, setTeachers] = useState<BookingReferenceData['teachers']>([])
  const [sessionTeachers, setSessionTeachers] = useState<CourseRecord[]>([])
  const [lessons, setLessons] = useState<CourseRecord[]>([])
  const [reviewing, setReviewing] = useState<CourseRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [itemResult, referenceResult, sessionTeacherResult, lessonResult] = await Promise.allSettled([
        api.listCourseResource(token, 'teacherEvents', { page: 1, perPage: 100, status }),
        api.getBookingReferenceData(token),
        api.listCourseResource(token, 'sessionTeachers', { page: 1, perPage: 100 }),
        api.listCourseResource(token, 'lessons', { page: 1, perPage: 100 }),
      ])
      if (itemResult.status === 'rejected') throw itemResult.reason
      setItems(itemResult.value.items)
      setTeachers(referenceResult.status === 'fulfilled' ? referenceResult.value.teachers : [])
      setSessionTeachers(sessionTeacherResult.status === 'fulfilled' ? sessionTeacherResult.value.items : [])
      setLessons(lessonResult.status === 'fulfilled' ? lessonResult.value.items : [])
    }
    catch (loadError) { setError(message(loadError, '加载教师工作量失败')) }
    finally { setLoading(false) }
  }, [api, status, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function confirm(reason: string) {
    if (!reviewing) return
    setLoading(true); setError('')
    try {
      await api.confirmTeacherCredit(token, reviewing.id, reason)
      setReviewing(null)
      await load()
    } catch (commandError) {
      setError(message(commandError, '确认教师工作量失败'))
      setLoading(false)
    }
  }

  return <WorkspacePanel>
    <PageHeader
      actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新教师工作量" onClick={() => void load()} type="button" />}
      badge={<Badge tone={status === 'pending' && items.length ? 'amber' : 'green'}>{items.length} 条{workloadStatusLabel(status)}</Badge>}
      description="按确认状态核对课堂产生的教师工作量；Admin 可在复核课堂、教师、数量与原因后代为确认。"
      eyebrow="教师结算"
      icon={viewBusinessIcons.teachers}
      title="教师工作量"
    />
    <SummaryBand>
      <SummaryMetric label={workloadStatusLabel(status)} value={items.length} />
      <SummaryMetric label="当前工作量" value={sum(items)} />
    </SummaryBand>
    <div className="px-4 sm:px-5"><Tabs label="教师工作量状态" onChange={setStatus} options={[{ label: '待确认', value: 'pending' }, { label: '已确认', value: 'confirmed' }, { label: '已撤销', value: 'reversed' }]} value={status} /></div>
    <AsyncState empty={items.length === 0 ? <EmptyState noun={`${workloadStatusLabel(status)}教师工作量`} /> : undefined} error={error} loading={loading && items.length === 0} loadingLabel="正在加载教师工作量..." onRetry={() => void load()}>
      <ResponsiveDataRegion desktop={<WorkloadTable items={items} lessons={lessons} onReview={setReviewing} sessionTeachers={sessionTeachers} status={status} teachers={teachers} />} mobile={items.map((item) => <WorkloadCard item={item} key={item.id} lessons={lessons} onReview={setReviewing} sessionTeachers={sessionTeachers} status={status} teachers={teachers} />)} />
    </AsyncState>
    {reviewing ? <TeacherCreditReviewDialog event={reviewing} lessons={lessons} loading={loading} onCancel={() => setReviewing(null)} onConfirm={confirm} sessionTeachers={sessionTeachers} teachers={teachers} /> : null}
  </WorkspacePanel>
}

function WorkloadTable({ items, lessons, onReview, sessionTeachers, status, teachers }: WorkloadReferenceProps & { items: CourseRecord[] }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">教师</th><th className="px-4 py-3">对应课堂</th><th className="px-4 py-3">记录类型</th><th className="px-4 py-3">工作量</th><th className="px-4 py-3">说明</th><th className="px-4 py-3">记录时间</th>{status === 'pending' ? <th className="px-4 py-3 text-right">操作</th> : null}</tr></thead><tbody>{items.map((item) => { const teacher = teachers.find((person) => person.id === String(item.teacherId)); const lesson = lessonForEvent(item, sessionTeachers, lessons); return <tr className="border-b border-[var(--border)]" key={item.id}><td className="px-4 py-3"><strong>{personName(teacher, String(item.teacherId))}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{teacher?.cellphone || '联系方式待补充'}</p></td><td className="px-4 py-3">{recordName(lesson, '', '课堂')}</td><td className="px-4 py-3">{creditEventLabel(item.eventType)}</td><td className="px-4 py-3 tabular-nums">{value(item.quantityDelta)} 课时</td><td className="px-4 py-3">{value(item.reason, '课堂完成后自动记录')}</td><td className="px-4 py-3">{formatDateTime(item.created, '时间待补充')}</td>{status === 'pending' ? <td className="px-4 py-3 text-right"><Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => onReview(item)} type="button">复核确认</Button></td> : null}</tr> })}</tbody></DataTable>
}

function WorkloadCard({ item, lessons, onReview, sessionTeachers, status, teachers }: WorkloadReferenceProps & { item: CourseRecord }) {
  const teacher = teachers.find((person) => person.id === String(item.teacherId))
  const lesson = lessonForEvent(item, sessionTeachers, lessons)
  return <article className="grid gap-2 p-4"><div className="flex items-start justify-between gap-3"><div><strong>{personName(teacher, String(item.teacherId))}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{recordName(lesson, '', '课堂')} · {formatDateTime(item.created, '时间待补充')}</p></div><Badge tone={status === 'pending' ? 'amber' : 'green'}>{value(item.quantityDelta)} 课时</Badge></div><p className="text-sm text-[var(--muted-foreground)]">{creditEventLabel(item.eventType)} · {value(item.reason, '课堂完成后自动记录')}</p>{status === 'pending' ? <Button className="justify-self-start" onClick={() => onReview(item)} type="button">复核确认</Button> : null}</article>
}

function TeacherCreditReviewDialog({ event, lessons, loading, onCancel, onConfirm, sessionTeachers, teachers }: { event: CourseRecord; lessons: CourseRecord[]; loading: boolean; onCancel: () => void; onConfirm: (reason: string) => Promise<void>; sessionTeachers: CourseRecord[]; teachers: BookingReferenceData['teachers'] }) {
  const [reason, setReason] = useState('课堂工作量已由教务核对')
  const valid = reason.trim().length >= 4
  const teacher = teachers.find((person) => person.id === String(event.teacherId))
  const lesson = lessonForEvent(event, sessionTeachers, lessons)
  return <DialogShell description="确认会保留原始课堂工作量，并新增一条教务确认记录。" onRequestClose={onCancel} title="确认教师工作量"><form className="grid gap-5 p-5" onSubmit={(event_) => { event_.preventDefault(); if (valid) void onConfirm(reason.trim()) }}><SummaryBand><SummaryMetric label="教师" value={personName(teacher, String(event.teacherId))} /><SummaryMetric label="对应课堂" value={recordName(lesson, '', '课堂')} /><SummaryMetric label="确认工作量" value={`${value(event.quantityDelta)} 课时`} /></SummaryBand><Field htmlFor="teacher-credit-reason" hint="至少 4 个字符，将写入审计与确认记录。" label="确认说明"><Input id="teacher-credit-reason" onChange={(input) => setReason(input.target.value)} required value={reason} /></Field><TechnicalDetails fields={[{ label: '工作量记录编号', value: event.id }, { label: '教师编号', value: event.teacherId }, { label: '课堂教师记录编号', value: event.sessionTeacherId }, { label: '原始事件类型', value: event.eventType }]} /><div className="flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="secondary">返回核对</Button><Button disabled={loading || !valid} type="submit">确认工作量</Button></div></form></DialogShell>
}

function sum(items: CourseRecord[]) { return items.reduce((total, item) => total + Number(item.quantityDelta || 0), 0) }
function workloadStatusLabel(status: WorkloadStatus) { return ({ pending: '待确认', confirmed: '已确认', reversed: '已撤销' } as const)[status] }
function lessonForEvent(event: CourseRecord, sessionTeachers: CourseRecord[], lessons: CourseRecord[]) { const relation = sessionTeachers.find((item) => item.id === String(event.sessionTeacherId)); return lessons.find((lesson) => lesson.id === String(relation?.sessionId || '')) }
function value(input: unknown, fallback = '未知') { return input === undefined || input === null || input === '' ? fallback : String(input) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

interface WorkloadReferenceProps {
  lessons: CourseRecord[]
  onReview: (item: CourseRecord) => void
  sessionTeachers: CourseRecord[]
  status: WorkloadStatus
  teachers: BookingReferenceData['teachers']
}
