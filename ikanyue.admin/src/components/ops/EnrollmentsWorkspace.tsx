import { Eye, Plus, RefreshCw, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import { viewBusinessIcons } from '../../app/businessIcons'
import { enrollmentStatusLabel, formatDateTime, formatMoney, personName, personOption, recordName, recordOption, roleLabel } from '../../app/coursePresentation'
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
import { ReferenceSelect } from '../ui/ReferenceSelect'
import { TechnicalDetails } from '../ui/TechnicalDetails'

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
      <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载报课列表" onClick={() => void load()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新建报课" onClick={() => setEditorOpen(true)} type="button" variant="primary" /></>} badge={<Badge tone={pendingSync ? 'amber' : 'green'}>{pendingSync} 条待同步</Badge>} description="由管理员选择学员、课包、价格和可选班级；系统自动创建订单、发放课时并记录审计。" eyebrow="课程运营" title="报课管理" icon={viewBusinessIcons.enrollments} />
      <SummaryBand><SummaryMetric label="报课记录" value={enrollments.length} /><SummaryMetric label="待名单同步" value={pendingSync} /><SummaryMetric label="待分班" value={awaitingClass} /></SummaryBand>
      <AsyncState empty={enrollments.length === 0 ? <EmptyState noun="报课记录" onCreate={() => setEditorOpen(true)} /> : undefined} error={error} loading={loading && enrollments.length === 0} loadingLabel="正在加载报课记录..." onRetry={() => void load()}>
        <ResponsiveDataRegion desktop={<EnrollmentTable classes={classes} enrollments={enrollments} onSelect={setSelected} onSync={previewSync} packages={packages} students={students} />} mobile={enrollments.map((item) => <EnrollmentCard classes={classes} enrollment={item} key={item.id} onSelect={() => setSelected(item)} onSync={() => void previewSync(item)} packages={packages} students={students} />)} />
      </AsyncState>
      {editorOpen ? <EnrollmentDialog classes={classes} defaultClassId={searchParams.get('classId') || ''} defaultStudentId={searchParams.get('studentId') || ''} loading={loading} onClose={() => { setEditorOpen(false); setSearchParams({}) }} onSubmit={enroll} packages={packages} prices={prices} students={students} /> : null}
      {selected ? <EnrollmentDrawer classes={classes} enrollment={selected} onClose={() => setSelected(null)} packages={packages} students={students} /> : null}
      {syncPreview ? <ConfirmDialog confirmLabel="确认同步" description={<>将学员加入 {syncPreview.lessons.length} 节已发布的未来课堂。系统会校验名单版本，冲突时不会覆盖其他管理员的修改。</>} onCancel={() => { setSyncPreview(null); setSyncTarget(null) }} onConfirm={() => void confirmSync()} title="确认同步课堂名单" /> : null}
    </WorkspacePanel>
  )
}

function EnrollmentTable({ classes, enrollments, onSelect, onSync, packages, students }: { classes: CourseRecord[]; enrollments: EnrollmentOperation[]; onSelect: (item: EnrollmentOperation) => void; onSync: (item: EnrollmentOperation) => void; packages: CourseRecord[]; students: StudentRecord[] }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">学员</th><th className="px-4 py-3">所报课包</th><th className="px-4 py-3">进入班级</th><th className="px-4 py-3">提交时间</th><th className="px-4 py-3">处理结果</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{enrollments.map((item) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={item.id}><td className="px-4 py-3"><strong>{personName(students.find((student) => student.id === item.studentId), item.studentId)}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{students.find((student) => student.id === item.studentId)?.cellphone || '联系方式待补充'}</p></td><td className="px-4 py-3">{recordName(packages.find((record) => record.id === item.requestSnapshot.packageId), item.requestSnapshot.packageId, '课包')}</td><td className="px-4 py-3">{item.requestSnapshot.classId ? recordName(classes.find((record) => record.id === item.requestSnapshot.classId), item.requestSnapshot.classId, '班级') : '暂不分班'}</td><td className="px-4 py-3">{formatDateTime(item.created, '时间待补充')}</td><td className="px-4 py-3"><EnrollmentBadge status={item.resultSnapshot.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton icon={<Eye className="h-4 w-4" />} label="查看报课详情" onClick={() => onSelect(item)} type="button" variant="ghost" />{item.resultSnapshot.status === 'synchronizing_future_lessons' ? <Button icon={<RotateCw className="h-4 w-4" />} onClick={() => onSync(item)} type="button" variant="secondary">同步名单</Button> : null}</div></td></tr>)}</tbody></DataTable>
}

function EnrollmentCard({ classes, enrollment, onSelect, onSync, packages, students }: { classes: CourseRecord[]; enrollment: EnrollmentOperation; onSelect: () => void; onSync: () => void; packages: CourseRecord[]; students: StudentRecord[] }) {
  const student = students.find((item) => item.id === enrollment.studentId)
  return <article className="grid gap-3 px-4 py-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{personName(student, enrollment.studentId)}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student?.cellphone || '联系方式待补充'} · {formatDateTime(enrollment.created, '时间待补充')}</p></div><EnrollmentBadge status={enrollment.resultSnapshot.status} /></div><p className="text-sm">{recordName(packages.find((record) => record.id === enrollment.requestSnapshot.packageId), enrollment.requestSnapshot.packageId, '课包')} · {enrollment.requestSnapshot.classId ? recordName(classes.find((record) => record.id === enrollment.requestSnapshot.classId), enrollment.requestSnapshot.classId, '班级') : '暂不分班'}</p><div className="flex gap-2"><Button onClick={onSelect} type="button" variant="secondary">详情</Button>{enrollment.resultSnapshot.status === 'synchronizing_future_lessons' ? <Button onClick={onSync} type="button">同步名单</Button> : null}</div></article>
}

function EnrollmentDialog({ classes, defaultClassId, defaultStudentId, loading, onClose, onSubmit, packages, prices, students }: { classes: CourseRecord[]; defaultClassId: string; defaultStudentId: string; loading: boolean; onClose: () => void; onSubmit: (input: EnrollmentInput) => Promise<void>; packages: CourseRecord[]; prices: CourseRecord[]; students: StudentRecord[] }) {
  const [value, setValue] = useState<EnrollmentInput>({ studentId: defaultStudentId, packageId: '', priceVersionId: '', classId: defaultClassId, channel: 'admin' })
  const availablePrices = prices.filter((price) => !value.packageId || price.packageId === value.packageId)
  const valid = Boolean(value.studentId && value.packageId && value.priceVersionId)
  return <DialogShell description="选择学员和课包后，系统会创建订单并发放对应课时；班级可以稍后再分配。" onRequestClose={onClose} title="管理员报课"><form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (valid) void onSubmit(value) }}><Field htmlFor="enroll-student" label="学员"><ReferenceSelect id="enroll-student" onChange={(studentId) => setValue({ ...value, studentId })} options={students.map(personOption)} placeholder="按姓名或手机号搜索" value={value.studentId} /></Field><Field htmlFor="enroll-package" label="所报课包"><ReferenceSelect id="enroll-package" onChange={(packageId) => setValue({ ...value, packageId, priceVersionId: '' })} options={packages.map((record) => recordOption(record, [record.validityDurationDays ? `有效 ${record.validityDurationDays} 天` : '', record.status === 'active' ? '正在销售' : '未启用'].filter(Boolean).join(' · ')))} placeholder="搜索课包名称" value={value.packageId} /></Field><Field htmlFor="enroll-price" label="本次售价"><ReferenceSelect emptyLabel={value.packageId ? '该课包暂无有效售价' : '请先选择课包'} id="enroll-price" onChange={(priceVersionId) => setValue({ ...value, priceVersionId })} options={availablePrices.map((price) => ({ label: formatMoney(price.saleAmount ?? price.listAmount, price.currency), description: `${price.validFrom ? `生效于 ${formatDateTime(price.validFrom)}` : '当前有效'} · 第 ${price.version || 1} 版`, value: price.id, keywords: `${price.saleAmount} ${price.listAmount} ${price.currency}` }))} placeholder="选择当前售价" value={value.priceVersionId} /></Field><Field hint="不选班级时，报课完成后会进入待分班状态。" htmlFor="enroll-class" label="进入班级（可选）"><ReferenceSelect allowEmpty id="enroll-class" onChange={(classId) => setValue({ ...value, classId })} options={classes.map((record) => recordOption(record, [record.termStart && record.termEnd ? `${record.termStart} 至 ${record.termEnd}` : '', record.location].filter(Boolean).join(' · ')))} placeholder="搜索班级名称" value={value.classId || ''} /></Field><Field htmlFor="enroll-paid" label="实际收款金额（可选）"><Input id="enroll-paid" min="0" type="number" value={value.paidAmount ?? ''} onChange={(event) => setValue({ ...value, paidAmount: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field><Field hint="例如微信支付单号、收据号或线下收款凭证。" htmlFor="enroll-reference" label="支付流水号（可选）"><Input id="enroll-reference" value={value.paymentReference || ''} onChange={(event) => setValue({ ...value, paymentReference: event.target.value })} /></Field><Field htmlFor="enroll-reason" label="报课备注"><Input id="enroll-reason" value={value.reason || ''} onChange={(event) => setValue({ ...value, reason: event.target.value })} /></Field><div className="flex items-end justify-end gap-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading || !valid} type="submit">{loading ? '提交中...' : '确认报课'}</Button></div></form></DialogShell>
}

function EnrollmentDrawer({ classes, enrollment, onClose, packages, students }: { classes: CourseRecord[]; enrollment: EnrollmentOperation; onClose: () => void; packages: CourseRecord[]; students: StudentRecord[] }) {
  const student = students.find((item) => item.id === enrollment.studentId)
  return <DrawerShell description={`${personName(student, enrollment.studentId)} · ${formatDateTime(enrollment.created, '提交时间待补充')}`} onRequestClose={onClose} title="报课详情"><div className="grid gap-5 p-5"><SummaryBand><SummaryMetric label="处理结果" value={<EnrollmentBadge status={enrollment.resultSnapshot.status} />} /><SummaryMetric label="已关联未来课堂" value={enrollment.resultSnapshot.sync?.futureLessonCount || 0} /><SummaryMetric label="发放课时" value={enrollment.resultSnapshot.courseHours || '-'} /></SummaryBand><dl className="grid gap-3 text-sm"><Fact label="学员" value={personName(student, enrollment.studentId)} /><Fact label="所报课包" value={recordName(packages.find((record) => record.id === enrollment.requestSnapshot.packageId), enrollment.requestSnapshot.packageId, '课包')} /><Fact label="进入班级" value={enrollment.requestSnapshot.classId ? recordName(classes.find((record) => record.id === enrollment.requestSnapshot.classId), enrollment.requestSnapshot.classId, '班级') : '暂未分班'} /><Fact label="经办人" value={roleLabel(enrollment.actorRole || 'admin')} /></dl><TechnicalDetails fields={[{ label: '报课操作编号', value: enrollment.operationNo }, { label: '报课记录编号', value: enrollment.id }, { label: '学员编号', value: enrollment.studentId }, { label: '课包编号', value: enrollment.requestSnapshot.packageId }, { label: '班级编号', value: enrollment.requestSnapshot.classId }, { label: '订单编号', value: enrollment.resultSnapshot.orderId || enrollment.sourceId }, { label: '经办人编号', value: enrollment.actorId }]} /></div></DrawerShell>
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-3"><dt className="text-[var(--muted-foreground)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div> }
function EnrollmentBadge({ status = '' }: { status?: string }) { return <Badge tone={status === 'failed' ? 'red' : status.includes('synchronizing') || status.includes('awaiting') ? 'amber' : 'green'}>{enrollmentStatusLabel(status)}</Badge> }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
