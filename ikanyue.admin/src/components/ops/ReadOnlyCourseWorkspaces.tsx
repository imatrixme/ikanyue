import { Eye, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import { viewBusinessIcons } from '../../app/businessIcons'
import type { CourseAccount } from '../../app/courseTypes'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion, Tabs } from '../ui/DataDisplay'
import { DrawerShell } from '../ui/DrawerShell'
import { CourseResourceWorkspace, type ResourceColumn } from './CourseResourceWorkspace'

export function AccountsWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [accounts, setAccounts] = useState<CourseAccount[]>([])
  const [selected, setSelected] = useState<CourseAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setAccounts((await api.listCourseResource<CourseAccount>(token, 'accounts', { page: 1, perPage: 100 })).items) }
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
  return <WorkspacePanel><PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新课时账户" onClick={() => void load()} type="button" />} badge={<Badge tone="blue">{accounts.length} 个账户</Badge>} description="按学员查看可用、已排、已用、过期和待激活课时；批次与不可变流水仅在 Admin 内展示。" eyebrow="课时核算" title="课时账户" icon={viewBusinessIcons.accounts} /><SummaryBand><SummaryMetric label="可用课时" value={sum(accounts, 'availableQuantity')} /><SummaryMetric label="已排课时" value={sum(accounts, 'frozenQuantity')} /><SummaryMetric label="已消耗" value={sum(accounts, 'consumedQuantity')} /></SummaryBand><AsyncState empty={accounts.length === 0 ? <EmptyState noun="课时账户" /> : undefined} error={error} loading={loading && accounts.length === 0} loadingLabel="正在加载课时账户..." onRetry={() => void load()}><ResponsiveDataRegion desktop={<AccountTable accounts={accounts} onOpen={open} />} mobile={accounts.map((account) => <button className="grid gap-2 p-4 text-left" key={account.studentId} onClick={() => void open(account)} type="button"><strong>学员 {account.studentId}</strong><span className="text-sm text-[var(--muted-foreground)]">可用 {account.availableQuantity} · 已排 {account.frozenQuantity} · 已用 {account.consumedQuantity}</span></button>)} /></AsyncState>{selected ? <DrawerShell description={`学员 ${selected.studentId}`} onRequestClose={() => setSelected(null)} size="wide" title="课时账户明细"><div className="grid gap-5 p-5"><SummaryBand><SummaryMetric label="可用" value={selected.availableQuantity} /><SummaryMetric label="已排" value={selected.frozenQuantity} /><SummaryMetric label="已用" value={selected.consumedQuantity} /><SummaryMetric label="过期" value={selected.expiredQuantity} /></SummaryBand><section><h2 className="font-semibold">来源批次</h2><div className="mt-3 grid gap-2">{selected.batches?.map((batch) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={batch.id}>{String(batch.creditTypeName || batch.creditTypeId || batch.id)} · 可用 {String(batch.availableQuantity ?? '-')} · {String(batch.effectiveExpiresAt || '长期有效')}</p>)}{!selected.batches?.length ? <p className="text-sm text-[var(--muted-foreground)]">暂无批次明细。</p> : null}</div></section><section><h2 className="font-semibold">不可变流水</h2><div className="mt-3 grid gap-2">{selected.events?.map((event) => <p className="rounded-md border border-[var(--border)] p-3 text-sm" key={event.id}>{String(event.eventType || '事件')} · {Number(event.quantityDelta || 0) > 0 ? '+' : ''}{String(event.quantityDelta ?? 0)} · {String(event.reason || event.operationId || '无备注')}</p>)}{!selected.events?.length ? <p className="text-sm text-[var(--muted-foreground)]">暂无课程课时流水。</p> : null}</div></section></div></DrawerShell> : null}</WorkspacePanel>
}

function AccountTable({ accounts, onOpen }: { accounts: CourseAccount[]; onOpen: (account: CourseAccount) => Promise<void> }) { return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">学员</th><th className="px-4 py-3">可用</th><th className="px-4 py-3">已排</th><th className="px-4 py-3">已用</th><th className="px-4 py-3">过期</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{accounts.map((account) => <tr className="border-b border-[var(--border)]" key={account.studentId}><td className="px-4 py-3 font-semibold">{account.studentId}</td><td className="px-4 py-3">{account.availableQuantity}</td><td className="px-4 py-3">{account.frozenQuantity}</td><td className="px-4 py-3">{account.consumedQuantity}</td><td className="px-4 py-3">{account.expiredQuantity}</td><td className="px-4 py-3 text-right"><IconButton icon={<Eye className="h-4 w-4" />} label="查看课时账户明细" onClick={() => void onOpen(account)} type="button" variant="ghost" /></td></tr>)}</tbody></DataTable> }

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
