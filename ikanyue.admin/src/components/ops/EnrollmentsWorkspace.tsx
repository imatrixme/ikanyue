import { Eye, Plus, RefreshCw, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { CourseRecord, EnrollmentInput, EnrollmentOperation, RosterSyncPreview } from '../../app/courseTypes'
import type { StudentRecord } from '../../app/types'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface EnrollmentsWorkspaceProps { api: OpsApi; token: string }

export function EnrollmentsWorkspace({ api, token }: EnrollmentsWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [enrollments, setEnrollments] = useState<EnrollmentOperation[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [packages, setPackages] = useState<CourseRecord[]>([])
  const [prices, setPrices] = useState<CourseRecord[]>([])
  const [classes, setClasses] = useState<CourseRecord[]>([])
  const [selected, setSelected] = useState<EnrollmentOperation | null>(null)
  const [syncTarget, setSyncTarget] = useState<EnrollmentOperation | null>(null)
  const [syncPreview, setSyncPreview] = useState<RosterSyncPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(searchParams.get('new') === '1' || Boolean(searchParams.get('studentId')))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [enrollmentPage, studentPage, packagePage, pricePage, classPage] = await Promise.all([
        api.listCourseResource<EnrollmentOperation>(token, 'enrollments', { page: 1, perPage: 100 }),
        api.listManagedStudents(token, { page: 1, perPage: 100 }),
        api.listCourseResource(token, 'packages', { page: 1, perPage: 100, status: 'active' }),
        api.listCourseResource(token, 'priceVersions', { page: 1, perPage: 100, status: 'active' }),
        api.listCourseResource(token, 'classes', { page: 1, perPage: 100 }),
      ])
      setEnrollments(enrollmentPage.items)
      setStudents(studentPage.items)
      setPackages(packagePage.items)
      setPrices(pricePage.items)
      setClasses(classPage.items)
    } catch (loadError) {
      setError(message(loadError, '加载报课数据失败'))
    } finally {
      setLoading(false)
    }
  }, [api, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function enroll(input: EnrollmentInput) {
    setLoading(true)
    try {
      await api.createEnrollment(token, input)
      setEditorOpen(false)
      setSearchParams({})
      await load()
    } catch (enrollmentError) {
      setError(message(enrollmentError, '报课失败'))
      setLoading(false)
    }
  }

  async function previewSync(enrollment: EnrollmentOperation) {
    const orderId = enrollment.resultSnapshot.orderId || enrollment.sourceId
    setLoading(true)
    try {
      setSelected(null)
      setSyncTarget(enrollment)
      setSyncPreview(await api.previewEnrollmentSync(token, orderId))
    } catch (previewError) {
      setError(message(previewError, '加载名单同步预览失败'))
    } finally {
      setLoading(false)
    }
  }

  async function confirmSync() {
    if (!syncTarget || !syncPreview) return
    const orderId = syncTarget.resultSnapshot.orderId || syncTarget.sourceId
    setLoading(true)
    try {
      await api.confirmEnrollmentSync(token, orderId, syncPreview.previewHash, syncPreview.lessons.map((lesson) => lesson.lessonId))
      setSyncPreview(null)
      setSyncTarget(null)
      await load()
    } catch (syncError) {
      setError(message(syncError, '同步课堂名单失败'))
      setLoading(false)
    }
  }

  const pendingSync = enrollments.filter((item) => item.resultSnapshot.status === 'synchronizing_future_lessons').length
  const awaitingClass = enrollments.filter((item) => item.resultSnapshot.status === 'awaiting_class_assignment').length

  return (
    <WorkspacePanel>
      <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载报课列表" onClick={() => void load()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新建报课" onClick={() => setEditorOpen(true)} type="button" variant="primary" /></>} badge={<Badge tone={pendingSync ? 'amber' : 'green'}>{pendingSync} 条待同步</Badge>} description="由管理员选择学员、课包、价格和可选班级；系统自动创建订单、发放课时并记录审计。" eyebrow="课程运营" title="报课管理" />
      <SummaryBand><SummaryMetric label="报课记录" value={enrollments.length} /><SummaryMetric label="待名单同步" value={pendingSync} /><SummaryMetric label="待分班" value={awaitingClass} /></SummaryBand>
      <AsyncState empty={enrollments.length === 0 ? <EmptyState noun="报课记录" onCreate={() => setEditorOpen(true)} /> : undefined} error={error} loading={loading && enrollments.length === 0} loadingLabel="正在加载报课记录..." onRetry={() => void load()}>
        <ResponsiveDataRegion desktop={<EnrollmentTable enrollments={enrollments} onSelect={setSelected} onSync={previewSync} />} mobile={enrollments.map((item) => <EnrollmentCard enrollment={item} key={item.id} onSelect={() => setSelected(item)} onSync={() => void previewSync(item)} />)} />
      </AsyncState>
      {editorOpen ? <EnrollmentDialog classes={classes} defaultClassId={searchParams.get('classId') || ''} defaultStudentId={searchParams.get('studentId') || ''} loading={loading} onClose={() => { setEditorOpen(false); setSearchParams({}) }} onSubmit={enroll} packages={packages} prices={prices} students={students} /> : null}
      {selected ? <EnrollmentDrawer enrollment={selected} onClose={() => setSelected(null)} /> : null}
      {syncPreview ? <ConfirmDialog confirmLabel="确认同步" description={<>将学员加入 {syncPreview.lessons.length} 节已发布的未来课堂。系统会校验名单版本，冲突时不会覆盖其他管理员的修改。</>} onCancel={() => { setSyncPreview(null); setSyncTarget(null) }} onConfirm={() => void confirmSync()} title="确认同步课堂名单" /> : null}
    </WorkspacePanel>
  )
}

function EnrollmentTable({ enrollments, onSelect, onSync }: { enrollments: EnrollmentOperation[]; onSelect: (item: EnrollmentOperation) => void; onSync: (item: EnrollmentOperation) => void }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">操作编号</th><th className="px-4 py-3">学员</th><th className="px-4 py-3">课包</th><th className="px-4 py-3">班级</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{enrollments.map((item) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={item.id}><td className="px-4 py-3 font-medium">{item.operationNo}</td><td className="px-4 py-3">{item.studentId}</td><td className="px-4 py-3">{item.requestSnapshot.packageId || '-'}</td><td className="px-4 py-3">{item.requestSnapshot.classId || '待分班'}</td><td className="px-4 py-3"><EnrollmentBadge status={item.resultSnapshot.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton icon={<Eye className="h-4 w-4" />} label="查看报课详情" onClick={() => onSelect(item)} type="button" variant="ghost" />{item.resultSnapshot.status === 'synchronizing_future_lessons' ? <Button icon={<RotateCw className="h-4 w-4" />} onClick={() => onSync(item)} type="button" variant="secondary">同步名单</Button> : null}</div></td></tr>)}</tbody></DataTable>
}

function EnrollmentCard({ enrollment, onSelect, onSync }: { enrollment: EnrollmentOperation; onSelect: () => void; onSync: () => void }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{enrollment.operationNo}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">学员 {enrollment.studentId}</p></div><EnrollmentBadge status={enrollment.resultSnapshot.status} /></div><p className="text-sm">课包 {enrollment.requestSnapshot.packageId || '-'} · {enrollment.requestSnapshot.classId || '待分班'}</p><div className="flex gap-2"><Button onClick={onSelect} type="button" variant="secondary">详情</Button>{enrollment.resultSnapshot.status === 'synchronizing_future_lessons' ? <Button onClick={onSync} type="button">同步名单</Button> : null}</div></article>
}

function EnrollmentDialog({ classes, defaultClassId, defaultStudentId, loading, onClose, onSubmit, packages, prices, students }: { classes: CourseRecord[]; defaultClassId: string; defaultStudentId: string; loading: boolean; onClose: () => void; onSubmit: (input: EnrollmentInput) => Promise<void>; packages: CourseRecord[]; prices: CourseRecord[]; students: StudentRecord[] }) {
  const [value, setValue] = useState<EnrollmentInput>({ studentId: defaultStudentId, packageId: '', priceVersionId: '', classId: defaultClassId, channel: 'admin' })
  const availablePrices = prices.filter((price) => !value.packageId || price.packageId === value.packageId)
  return <DialogShell description="提交后会自动创建订单、发放课程课时，并在选择班级时建立成员关系。" onRequestClose={onClose} title="管理员报课"><form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSubmit(value) }}><Field htmlFor="enroll-student" label="学员"><Select id="enroll-student" options={students.map((student) => ({ label: `${student.realName || student.nickName} · ${student.cellphone}`, value: student.id }))} required value={value.studentId} onChange={(event) => setValue({ ...value, studentId: event.target.value })} /></Field><Field htmlFor="enroll-package" label="课包"><Select id="enroll-package" options={packages.map(option)} required value={value.packageId} onChange={(event) => setValue({ ...value, packageId: event.target.value, priceVersionId: '' })} /></Field><Field htmlFor="enroll-price" label="价格版本"><Select id="enroll-price" options={availablePrices.map((price) => ({ label: `${price.saleAmount ?? price.listAmount} ${price.currency || 'CNY'} · V${price.version || 1}`, value: price.id }))} required value={value.priceVersionId} onChange={(event) => setValue({ ...value, priceVersionId: event.target.value })} /></Field><Field htmlFor="enroll-class" label="班级（可选）"><Select allowEmpty id="enroll-class" options={classes.map(option)} value={value.classId || ''} onChange={(event) => setValue({ ...value, classId: event.target.value })} /></Field><Field htmlFor="enroll-paid" label="实付金额（可选）"><Input id="enroll-paid" min="0" type="number" value={value.paidAmount ?? ''} onChange={(event) => setValue({ ...value, paidAmount: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field><Field htmlFor="enroll-reference" label="支付参考"><Input id="enroll-reference" value={value.paymentReference || ''} onChange={(event) => setValue({ ...value, paymentReference: event.target.value })} /></Field><Field htmlFor="enroll-reason" label="备注"><Input id="enroll-reason" value={value.reason || ''} onChange={(event) => setValue({ ...value, reason: event.target.value })} /></Field><div className="flex items-end justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading} type="submit">{loading ? '提交中...' : '确认报课'}</Button></div></form></DialogShell>
}

function EnrollmentDrawer({ enrollment, onClose }: { enrollment: EnrollmentOperation; onClose: () => void }) {
  return <DrawerShell description={enrollment.operationNo} onRequestClose={onClose} title="报课详情"><div className="grid gap-5 p-5"><SummaryBand><SummaryMetric label="当前状态" value={<EnrollmentBadge status={enrollment.resultSnapshot.status} />} /><SummaryMetric label="未来课堂" value={enrollment.resultSnapshot.sync?.futureLessonCount || 0} /><SummaryMetric label="主订单" value={enrollment.resultSnapshot.orderId || enrollment.sourceId} /></SummaryBand><dl className="grid gap-3 text-sm"><Fact label="学员编号" value={enrollment.studentId} /><Fact label="课包编号" value={enrollment.requestSnapshot.packageId || '-'} /><Fact label="班级编号" value={enrollment.requestSnapshot.classId || '待分班'} /><Fact label="操作人" value={`${enrollment.actorRole || 'admin'} · ${enrollment.actorId || '-'}`} /></dl></div></DrawerShell>
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-3"><dt className="text-[var(--muted-foreground)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div> }
function EnrollmentBadge({ status = '' }: { status?: string }) { const text = ({ completed: '已完成', awaiting_class_assignment: '待分班', synchronizing_future_lessons: '待同步名单', completed_with_warnings: '已完成有提醒', failed: '失败' } as Record<string, string>)[status] || status || '处理中'; return <Badge tone={status === 'failed' ? 'red' : status.includes('synchronizing') || status.includes('awaiting') ? 'amber' : 'green'}>{text}</Badge> }
function option(record: CourseRecord) { return { label: String(record.name || record.code || record.id), value: record.id } }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
