import { CheckCheck, RefreshCw, RotateCw, FlaskConical } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { commerceApi, findingLabel, money, moneyStatus, type FinanceSummary, type MoneyRecord } from '../../app/commerceApi'
import { viewBusinessIcons } from '../../app/businessIcons'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, Tabs } from '../ui/DataDisplay'
import { CommerceOrders } from './CommerceOrders'
import { CommerceOffers } from './CommerceOffers'
import { CommerceCases } from './CommerceCases'
import { CommerceStatements } from './CommerceStatements'

export function PaymentsWorkspace({ token }: { token: string }) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'orders' | 'offers' | 'cases' | 'statements' | 'payments' | 'refunds' | 'findings'>('orders')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setSummary(await commerceApi.finance(token)) }
    catch (problem) { setError(problem instanceof Error ? problem.message : '收退款暂时无法加载') }
    finally { setLoading(false) }
  }, [token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  async function act(action: () => Promise<string>) {
    setLoading(true); setError(''); setNotice('')
    try { setNotice(await action()); setSummary(await commerceApi.finance(token)) }
    catch (problem) { setError(problem instanceof Error ? problem.message : '操作尚未完成') }
    finally { setLoading(false) }
  }
  return <WorkspacePanel>
    <PageHeader title="收款与退款" description="" eyebrow="财务核对" icon={viewBusinessIcons.payments} actions={<div className="flex w-60 max-w-[calc(100vw-6rem)] flex-wrap gap-2 sm:w-auto sm:max-w-none">
      <IconButton label="刷新收退款" icon={<RefreshCw className="h-4 w-4" />} disabled={loading} onClick={() => void load()} />
      <Button variant="secondary" icon={<RotateCw />} disabled={loading} onClick={() => void act(async () => {
        const result = await commerceApi.recover(token)
        return `结果同步完成，仍需核对 ${result.orders.unresolved + result.refunds.unresolved} 笔`
      })}>同步支付结果</Button>
      <Button icon={<CheckCheck />} disabled={loading} onClick={() => void act(async () => {
        const result = await commerceApi.reconcile(token)
        return result.findings.length ? `本次发现 ${result.findings.length} 项差异` : '本次核对未发现差异'
      })}>核对支付记录</Button>
    </div>} />
    {summary?.provider === 'mock' ? <p className="border-b border-[var(--border)] bg-[var(--warning-soft)] px-4 py-3 text-sm">模拟支付环境 · 以下金额不代表真实公司收款，历史线下转账不计入</p> : null}
    {notice ? <p role="status" className="px-4 py-3 text-sm">{notice}</p> : null}
    {summary ? <SummaryBand><SummaryMetric label="累计收款" value={money(summary.captured)} /><SummaryMetric label="已退金额" value={money(summary.refunded)} /><SummaryMetric label="退款处理中" value={money(summary.refundReserved)} /><SummaryMetric label="渠道结算到账" value={money(summary.settled)} /></SummaryBand> : null}
    <div className="overflow-x-auto px-4"><Tabs label="收退款视图" onChange={setTab} value={tab} options={[{ value: 'orders', label: '订单管理' }, { value: 'offers', label: '课程商品' }, { value: 'cases', label: '待处理异常' }, { value: 'statements', label: '账单与到账' }, { value: 'payments', label: '收款记录' }, { value: 'refunds', label: '退款记录' }, { value: 'findings', label: '历史核对差异' }]} /></div>
    {tab === 'orders' ? <CommerceOrders token={token} /> : null}
    {tab === 'offers' ? <CommerceOffers token={token} /> : null}
    {tab === 'cases' ? <CommerceCases token={token} /> : null}
    {tab === 'statements' ? <CommerceStatements token={token} /> : null}
    <AsyncState error={error} loading={loading && !summary} loadingLabel="正在核对收退款..." onRetry={() => void load()}>
      {summary && (tab === 'payments' || tab === 'refunds') ? <div className="divide-y divide-[var(--border)]">{summary[tab].length ? summary[tab].map((record) => <TransactionRow key={record.id} record={record} refund={tab === 'refunds'} action={tab === 'refunds' && summary.mockEnabled && record.status === 'processing' ? <Button variant="secondary" disabled={loading} icon={<FlaskConical />} onClick={() => {
        if (window.confirm('仅模拟退款到账，不会发生真实资金转移。继续？')) void act(async () => {
          await commerceApi.mockRefund(token, record.reference); return '已模拟退款到账'
        })
      }}>模拟退款到账</Button> : undefined} />) : <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">暂无{tab === 'payments' ? '收款订单' : '退款记录'}</p>}</div> : null}
      {summary && tab === 'findings' ? <div className="divide-y divide-[var(--border)]">{summary.findings.length ? summary.findings.map((finding) => <div key={finding.id} className="px-4 py-4"><strong>{findingLabel(finding.data.reason)}</strong><p className="mt-1 text-sm text-[var(--muted-foreground)]">发现于 {new Date(finding.data.occurredAt).toLocaleString('zh-CN')}</p><details className="mt-2 text-xs"><summary>核对凭证</summary><p className="break-all">支付记录编号：{finding.data.targetId}</p></details></div>) : <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">暂无历史差异记录</p>}</div> : null}
    </AsyncState>
  </WorkspacePanel>
}

function TransactionRow({ record, refund, action }: { record: MoneyRecord; refund: boolean; action?: React.ReactNode }) {
  return <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
    <div className="min-w-0"><strong className="break-words">{record.name}</strong><p className="mt-1 text-sm text-[var(--muted-foreground)]">{record.student?.name || '学员待核对'} · {record.student?.cellphone || '暂无手机号'}</p></div>
    <div><p className="font-semibold">{money(record.amount)} <span className="ml-2 text-sm font-normal">{moneyStatus(record, refund)}</span></p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{new Date(record.createdAt).toLocaleString('zh-CN')}</p></div>
    <div className="min-w-0">{action}<details className="mt-2 text-xs text-[var(--muted-foreground)]"><summary>订单凭证</summary><p className="mt-1 break-all">订单编号：{record.reference}</p></details></div>
  </div>
}
