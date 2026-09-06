import { CheckCircle2, RefreshCw, ScanSearch, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingBackfillPreview, BookingConflict, BookingReferenceData } from '../../app/bookingTypes'
import { personName, recordName } from '../../app/coursePresentation'
import type { CourseRecord } from '../../app/courseTypes'
import type { StudentRecord } from '../../app/types'
import { SectionHeader } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton, Textarea } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, Pagination, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { Field, Input } from '../ui/Input'
import { TechnicalDetails } from '../ui/TechnicalDetails'

export function BookingConflictViews({ api, referenceData, token }: { api: OpsApi; referenceData: BookingReferenceData; token: string }) {
  const [conflicts, setConflicts] = useState<BookingConflict[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [lessons, setLessons] = useState<CourseRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [status, setStatus] = useState('open')
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState('')
  const [preview, setPreview] = useState<BookingBackfillPreview | null>(null)
  const [resolveTarget, setResolveTarget] = useState<BookingConflict | null>(null)
  const [applyConfirm, setApplyConfirm] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [result, studentResult, lessonResult] = await Promise.all([
        api.listBookingConflicts(token, { page, perPage: 20, status }),
        api.listManagedStudents(token, { page: 1, perPage: 100 }),
        api.listCourseResource(token, 'lessons', { page: 1, perPage: 100 }),
      ])
      setConflicts(result.items); setTotalItems(result.totalItems); setTotalPages(result.totalPages)
      setStudents(studentResult.items); setLessons(lessonResult.items)
    } catch (loadError) { setError(message(loadError, '加载预约冲突失败')) }
    finally { setLoading(false) }
  }, [api, page, status, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function previewBackfill() {
    setLoading(true); setError(''); setResultMessage('')
    try { setPreview(await api.previewBookingBackfill(token, new Date(`${from}T00:00:00`).toISOString(), to ? new Date(`${to}T23:59:59`).toISOString() : undefined)) }
    catch (previewError) { setError(message(previewError, '回填预检失败')) }
    finally { setLoading(false) }
  }
  async function applyBackfill() {
    setLoading(true); setError('')
    try {
      const result = await api.applyBookingBackfill(token, new Date(`${from}T00:00:00`).toISOString(), to ? new Date(`${to}T23:59:59`).toISOString() : undefined)
      setResultMessage(`已扫描 ${result.scannedCount} 节未来课堂，占用 ${result.claimedSessionIds.length} 节；新增冲突 ${result.conflictCount} 条。`)
      setApplyConfirm(false); setPreview(null); await load()
    } catch (applyError) { setError(message(applyError, '执行回填失败')); setLoading(false) }
  }
  async function resolve(resolution: string) {
    if (!resolveTarget) return
    setLoading(true); setError('')
    try { await api.resolveBookingConflict(token, resolveTarget.id, resolution); setResolveTarget(null); await load() }
    catch (resolveError) { setError(message(resolveError, '关闭冲突失败')); setLoading(false) }
  }

  return <div><div className="grid gap-3 border-b border-[var(--border)] bg-[var(--brand-wash)] px-4 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto] sm:items-end"><Field htmlFor="backfill-from" label="未来课堂起始日"><Input id="backfill-from" onChange={(event) => { setFrom(event.target.value); setPreview(null) }} required type="date" value={from} /></Field><Field htmlFor="backfill-to" label="结束日（可选）"><Input id="backfill-to" min={from} onChange={(event) => { setTo(event.target.value); setPreview(null) }} type="date" value={to} /></Field><Button disabled={loading || !from} icon={<ScanSearch className="h-4 w-4" />} onClick={() => void previewBackfill()} type="button" variant="secondary">预检历史课堂</Button><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新冲突队列" onClick={() => void load()} type="button" /></div>{error ? <p className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--destructive)]">{error}</p> : null}{resultMessage ? <p className="border-b border-[var(--border)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{resultMessage}</p> : null}{preview ? <BackfillPreview onApply={() => setApplyConfirm(true)} preview={preview} /> : null}<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4"><SectionHeader description="启用教师预约前，应先处理同一教师或学员的历史排课重叠。" title="冲突处理队列" /><div className="flex gap-2"><Button onClick={() => { setStatus('open'); setPage(1) }} type="button" variant={status === 'open' ? 'primary' : 'secondary'}>待处理</Button><Button onClick={() => { setStatus('resolved'); setPage(1) }} type="button" variant={status === 'resolved' ? 'primary' : 'secondary'}>已处理</Button></div></div><AsyncState empty={!conflicts.length ? <EmptyState noun={status === 'open' ? '待处理冲突' : '已处理冲突'} /> : undefined} error={error} loading={loading && !conflicts.length} loadingLabel="正在加载冲突队列..." onRetry={() => void load()}><ResponsiveDataRegion desktop={<ConflictTable conflicts={conflicts} lessons={lessons} onResolve={setResolveTarget} referenceData={referenceData} students={students} />} mobile={conflicts.map((item) => <ConflictCard conflict={item} key={item.id} lessons={lessons} onResolve={() => setResolveTarget(item)} referenceData={referenceData} students={students} />)} /></AsyncState><Pagination onPageChange={setPage} page={page} totalItems={totalItems} totalPages={totalPages} />{resolveTarget ? <ResolveConflictDialog conflict={resolveTarget} lessons={lessons} loading={loading} onClose={() => setResolveTarget(null)} onResolve={resolve} referenceData={referenceData} students={students} /> : null}{applyConfirm && preview ? <ConfirmDialog confirmLabel="执行回填" destructive={!preview.ready} description={preview.ready ? `将为 ${preview.claimed} 节未来课堂建立时间占用。` : `预检发现 ${preview.conflicts.length} 条冲突。执行后会记录冲突并保持相关教师预约配置停用。`} onCancel={() => setApplyConfirm(false)} onConfirm={() => void applyBackfill()} title="确认回填未来课堂" /> : null}</div>
}

function BackfillPreview({ onApply, preview }: { onApply: () => void; preview: BookingBackfillPreview }) {
  return <section className="grid gap-4 border-b border-[var(--border)] px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-start gap-3"><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${preview.ready ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--warning-soft)] text-[var(--warning-foreground)]'}`}>{preview.ready ? <CheckCircle2 className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}</span><div><h3 className="font-semibold">回填预检{preview.ready ? '可以执行' : '发现冲突'}</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">扫描 {preview.scannedCount} 节未来课堂，可直接占用 {preview.claimed} 节，冲突 {preview.conflicts.length} 条。</p></div></div><Button onClick={onApply} type="button" variant={preview.ready ? 'primary' : 'danger'}>进入执行确认</Button></section>
}

function ConflictTable({ conflicts, lessons, onResolve, referenceData, students }: ConflictViewProps & { conflicts: BookingConflict[]; onResolve: (item: BookingConflict) => void }) {
  return <DataTable><thead><tr className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">冲突类型</th><th className="px-4 py-3">涉及人员</th><th className="px-4 py-3">时间</th><th className="px-4 py-3">关联安排</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{conflicts.map((item) => <tr className="border-b border-[var(--border)]" key={item.id}><td className="px-4 py-3"><p className="font-semibold">{conflictTypeLabel(item.type)}</p><p className="text-xs text-[var(--muted-foreground)]">{conflictDescription(item)}</p></td><td className="px-4 py-3">{teacherName(item.teacherId, referenceData)}{item.studentId ? <p className="text-xs text-[var(--muted-foreground)]">{personName(students.find((student) => student.id === item.studentId), item.studentId)}</p> : null}</td><td className="px-4 py-3">{formatDateTime(item.startAt)}<p className="text-xs text-[var(--muted-foreground)]">{formatTimeRange(item.startAt, item.endAt)}</p></td><td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{item.sessionId ? recordName(lessons.find((lesson) => lesson.id === item.sessionId), item.sessionId, '课堂') : item.appointmentId ? '课程预约' : '无关联安排'}</td><td className="px-4 py-3"><Badge tone={item.status === 'open' ? 'amber' : 'green'}>{item.status === 'open' ? '待处理' : '已处理'}</Badge></td><td className="px-4 py-3 text-right">{item.status === 'open' ? <Button onClick={() => onResolve(item)} type="button" variant="secondary">记录处理结果</Button> : <span className="text-xs text-[var(--muted-foreground)]">{item.resolution || '已关闭'}</span>}</td></tr>)}</tbody></DataTable>
}

function ConflictCard({ conflict, lessons, onResolve, referenceData, students }: ConflictViewProps & { conflict: BookingConflict; onResolve: () => void }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{conflictTypeLabel(conflict.type)}</h3><p className="text-xs text-[var(--muted-foreground)]">{teacherName(conflict.teacherId, referenceData)}{conflict.studentId ? ` · ${personName(students.find((student) => student.id === conflict.studentId), conflict.studentId)}` : ''}</p></div><Badge tone={conflict.status === 'open' ? 'amber' : 'green'}>{conflict.status === 'open' ? '待处理' : '已处理'}</Badge></div><p className="text-sm text-[var(--muted-foreground)]">{conflict.sessionId ? recordName(lessons.find((lesson) => lesson.id === conflict.sessionId), conflict.sessionId, '课堂') : '课程预约'} · {formatDateTime(conflict.startAt)} {formatTimeRange(conflict.startAt, conflict.endAt)}</p><p className="text-sm text-[var(--muted-foreground)]">{conflictDescription(conflict)}</p>{conflict.status === 'open' ? <Button onClick={onResolve} type="button" variant="secondary">记录处理结果</Button> : null}</article>
}

function ResolveConflictDialog({ conflict, lessons, loading, onClose, onResolve, referenceData, students }: ConflictViewProps & { conflict: BookingConflict; loading: boolean; onClose: () => void; onResolve: (resolution: string) => Promise<void> }) {
  const [resolution, setResolution] = useState('已核对排课并完成线下调整')
  return <DialogShell description="该操作只关闭冲突记录，不会自动移动或删除历史课堂。" onRequestClose={onClose} size="compact" title="记录冲突处理结果"><form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (resolution.trim().length >= 4) void onResolve(resolution.trim()) }}><div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm"><p className="font-semibold">{conflictTypeLabel(conflict.type)}</p><p className="mt-1 text-[var(--muted-foreground)]">{teacherName(conflict.teacherId, referenceData)}{conflict.studentId ? ` · ${personName(students.find((student) => student.id === conflict.studentId), conflict.studentId)}` : ''}</p><p className="mt-1 text-[var(--muted-foreground)]">{conflict.sessionId ? recordName(lessons.find((lesson) => lesson.id === conflict.sessionId), conflict.sessionId, '课堂') : '课程预约'} · {formatDateTime(conflict.startAt)} {formatTimeRange(conflict.startAt, conflict.endAt)}</p></div><Field htmlFor="conflict-resolution" label="处理结果"><Textarea id="conflict-resolution" minLength={4} onChange={(event) => setResolution(event.target.value)} required value={resolution} /></Field><TechnicalDetails fields={[{ label: '冲突记录编号', value: conflict.id }, { label: '教师编号', value: conflict.teacherId }, { label: '学员编号', value: conflict.studentId }, { label: '课堂编号', value: conflict.sessionId }, { label: '预约编号', value: conflict.appointmentId }]} /><div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading || resolution.trim().length < 4} type="submit">确认关闭冲突</Button></div></form></DialogShell>
}

function conflictTypeLabel(type: string) { return ({ teacher_overlap: '教师时间重叠', student_overlap: '学员时间重叠', claim_failed: '时间占用失败', eligibility_lost: '可用课时失效', backfill_overlap: '历史课堂重叠' } as Record<string, string>)[type] || type }
function conflictDescription(conflict: BookingConflict) { const reason = conflict.details?.reason; return typeof reason === 'string' ? reason : '需要教务核对相关课堂与预约安排。' }
function teacherName(id: string | undefined, refs: BookingReferenceData) { return personName(refs.teachers.find((item) => item.id === id), id) }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }) }
function formatTimeRange(start: string, end: string) { const format = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); return `${format(start)}-${format(end)}` }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

interface ConflictViewProps {
  lessons: CourseRecord[]
  referenceData: BookingReferenceData
  students: StudentRecord[]
}
