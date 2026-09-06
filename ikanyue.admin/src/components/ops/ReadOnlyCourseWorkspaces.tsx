import { Eye, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import { viewBusinessIcons } from '../../app/businessIcons'
import { creditEventLabel, formatDate, personName } from '../../app/coursePresentation'
import type { CourseAccount } from '../../app/courseTypes'
import type { StudentRecord } from '../../app/types'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion, Tabs } from '../ui/DataDisplay'
import { DrawerShell } from '../ui/DrawerShell'
import { TechnicalDetails } from '../ui/TechnicalDetails'
import { CourseResourceWorkspace, type ResourceColumn } from './CourseResourceWorkspace'

export function AccountsWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [accounts, setAccounts] = useState<CourseAccount[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [selected, setSelected] = useState<CourseAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [accountResult, studentResult] = await Promise.allSettled([
        api.listCourseResource<CourseAccount>(token, 'accounts', { page: 1, perPage: 100 }),
        api.listManagedStudents(token, { page: 1, perPage: 100 }),
      ])
      if (accountResult.status === 'rejected') throw accountResult.reason
      setAccounts(accountResult.value.items)
      setStudents(studentResult.status === 'fulfilled' ? studentResult.value.items : [])
    }
    catch (loadError) { setError(message(loadError, '加载课时账户失败')) }
    finally { setLoading(false) }
  }, [api, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  async function open(account: CourseAccount) {
    setLoading(true)
    try { setSelected(await api.getCourseResource<CourseAccount>(token, 'accounts', account.studentId)) }
    catch (loadError) { setError(message(loadError, '加载账户明细失败')) }
    finally { setLoading(false) }
  }
  const selectedStudent = selected ? students.find((student) => student.id === selected.studentId) : undefined
  return <WorkspacePanel><PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新课时账户" onClick={() => void load()} type="button" />} badge={<Badge tone="blue">{accounts.length} 个账户</Badge>} description="按学员查看可用、已用于未来课程、已使用、过期和待生效课时；完整账务记录保留在技术信息中。" eyebrow="课时核算" title="课时账户" icon={viewBusinessIcons.accounts} /><SummaryBand><SummaryMetric label="可用课时" value={sum(accounts, 'availableQuantity')} /><SummaryMetric label="未来课程占用" value={sum(accounts, 'frozenQuantity')} /><SummaryMetric label="已使用" value={sum(accounts, 'consumedQuantity')} /></SummaryBand><AsyncState empty={accounts.length === 0 ? <EmptyState noun="课时账户" /> : undefined} error={error} loading={loading && accounts.length === 0} loadingLabel="正在加载课时账户..." onRetry={() => void load()}><ResponsiveDataRegion desktop={<AccountTable accounts={accounts} onOpen={open} students={students} />} mobile={accounts.map((account) => { const student = students.find((item) => item.id === account.studentId); return <button className="grid gap-2 p-4 text-left" key={account.studentId} onClick={() => void open(account)} type="button"><strong>{personName(student, account.studentId)}</strong><span className="text-xs text-[var(--muted-foreground)]">{student?.cellphone || '联系方式待补充'}</span><span className="text-sm text-[var(--muted-foreground)]">可用 {account.availableQuantity} · 未来课程占用 {account.frozenQuantity} · 已使用 {account.consumedQuantity}</span></button> })} /></AsyncState>{selected ? <DrawerShell description={`${personName(selectedStudent, selected.studentId)} · ${selectedStudent?.cellphone || '联系方式待补充'}`} onRequestClose={() => setSelected(null)} size="wide" title="课时账户明细"><div className="grid gap-5 p-5"><SummaryBand><SummaryMetric label="当前可用" value={selected.availableQuantity} /><SummaryMetric label="未来课程占用" value={selected.frozenQuantity} /><SummaryMetric label="已经使用" value={selected.consumedQuantity} /><SummaryMetric label="已经过期" value={selected.expiredQuantity} /></SummaryBand><section><h2 className="font-semibold">课时来源</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">按课时类型和有效期分别使用，临近到期的会优先扣减。</p><div className="mt-3 grid gap-2">{selected.batches?.map((batch) => <div className="rounded-md border border-[var(--border)] p-3 text-sm" key={batch.id}><strong>{String(batch.creditTypeName || '课时类型待补充')}</strong><p className="mt-1 text-[var(--muted-foreground)]">当前可用 {String(batch.availableQuantity ?? '-')} 课时 · {batch.effectiveExpiresAt ? `有效至 ${formatDate(batch.effectiveExpiresAt)}` : '长期有效'}</p></div>)}{!selected.batches?.length ? <p className="text-sm text-[var(--muted-foreground)]">暂无课时来源。</p> : null}</div></section><section><h2 className="font-semibold">课时变动记录</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">到账、预约、上课使用、退回和更正都会保留记录。</p><div className="mt-3 grid gap-2">{selected.events?.map((event) => <div className="rounded-md border border-[var(--border)] p-3 text-sm" key={event.id}><strong>{creditEventLabel(event.eventType)}</strong><p className="mt-1 text-[var(--muted-foreground)]">{Number(event.quantityDelta || 0) > 0 ? '+' : ''}{String(event.quantityDelta ?? 0)} 课时 · {String(event.reason || '系统记录')}</p></div>)}{!selected.events?.length ? <p className="text-sm text-[var(--muted-foreground)]">暂无课时变动记录。</p> : null}</div></section><TechnicalDetails fields={[{ label: '学员编号', value: selected.studentId }, { label: '课时来源记录', value: selected.batches?.map((batch) => ({ id: batch.id, creditTypeId: batch.creditTypeId })) }, { label: '课时变动记录编号', value: selected.events?.map((event) => ({ id: event.id, operationId: event.operationId })) }]} /></div></DrawerShell> : null}</WorkspacePanel>
}

function AccountTable({ accounts, onOpen, students }: { accounts: CourseAccount[]; onOpen: (account: CourseAccount) => Promise<void>; students: StudentRecord[] }) { return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">学员</th><th className="px-4 py-3">当前可用</th><th className="px-4 py-3">未来课程占用</th><th className="px-4 py-3">已经使用</th><th className="px-4 py-3">已经过期</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{accounts.map((account) => { const student = students.find((item) => item.id === account.studentId); return <tr className="border-b border-[var(--border)]" key={account.studentId}><td className="px-4 py-3"><strong>{personName(student, account.studentId)}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student?.cellphone || '联系方式待补充'}</p></td><td className="px-4 py-3">{account.availableQuantity}</td><td className="px-4 py-3">{account.frozenQuantity}</td><td className="px-4 py-3">{account.consumedQuantity}</td><td className="px-4 py-3">{account.expiredQuantity}</td><td className="px-4 py-3 text-right"><IconButton icon={<Eye className="h-4 w-4" />} label={`查看${personName(student, account.studentId)}课时账户`} onClick={() => void onOpen(account)} type="button" variant="ghost" /></td></tr> })}</tbody></DataTable> }

const auditColumns: ResourceColumn[] = [{ key: 'created', label: '时间' }, { key: 'actorId', label: '操作人' }, { key: 'action', label: '动作' }, { key: 'resourceType', label: '资源' }, { key: 'outcome', label: '结果' }]
const settlementColumns: ResourceColumn[] = [{ key: 'detectedAt', label: '发现时间' }, { key: 'kind', label: '异常类型', render: (record) => settlementKindLabel(record.kind) }, { key: 'sessionId', label: '课堂' }, { key: 'studentId', label: '学员' }, { key: 'status', label: '处理状态', render: (record) => settlementStatusLabel(record.status) }, { key: 'reason', label: '原因' }]
const reconciliationColumns: ResourceColumn[] = [{ key: 'detectedAt', label: '发现时间' }, { key: 'code', label: '异常码' }, { key: 'field', label: '字段' }, { key: 'expectedValue', label: '期望值' }, { key: 'actualValue', label: '实际值' }]

export function AuditWorkspace(props: { api: OpsApi; token: string }) { return <CourseResourceWorkspace {...props} columns={auditColumns} description="追踪报课、班级、课堂、核销与更正的关键操作。" eyebrow="治理与追溯" noun="审计记录" resource="auditLogs" title="操作审计" /> }

export function ExceptionsWorkspace(props: { api: OpsApi; token: string }) {
  const [tab, setTab] = useState<'settlement' | 'reconciliation'>('settlement')
  return <div className="grid gap-4"><div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4"><Tabs label="异常类型" onChange={setTab} options={[{ label: '核销异常', value: 'settlement' }, { label: '对账异常', value: 'reconciliation' }]} value={tab} /></div>{tab === 'settlement' ? <CourseResourceWorkspace {...props} columns={settlementColumns} description="统一查看课时不足、过期释放、重复写入、失败操作与待更正课堂。" eyebrow="异常中心" noun="核销异常" resource="settlementExceptions" title="核销异常" /> : <CourseResourceWorkspace {...props} columns={reconciliationColumns} description="账本对账发现的字段差异与处理状态。" eyebrow="异常中心" noun="对账异常" resource="reconciliationExceptions" title="对账异常" />}</div>
}

function settlementKindLabel(value: unknown) { return ({ credit_insufficient: '课时不足', conversion_required: '需要兑换', expired_release: '过期释放', duplicate: '重复写入', failed_operation: '操作失败', correction_pending: '等待更正' } as Record<string, string>)[String(value)] || String(value || '-') }
function settlementStatusLabel(value: unknown) { return ({ open: '待处理', acknowledged: '已确认', resolved: '已解决', failed: '失败', correction_pending: '更正中' } as Record<string, string>)[String(value)] || String(value || '-') }
function sum(accounts: CourseAccount[], key: keyof CourseAccount) { return accounts.reduce((total, account) => total + Number(account[key] || 0), 0) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
