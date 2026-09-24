import { CheckCheck, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { commerceApi, money, type FinanceSummary } from '../../app/commerceApi'
import { viewBusinessIcons } from '../../app/businessIcons'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, Tabs } from '../ui/DataDisplay'
import { CommerceOrders } from './CommerceOrders'
import { CommerceOffers } from './CommerceOffers'
import { CommerceCases } from './CommerceCases'
import { CommerceStatements } from './CommerceStatements'

type PaymentsTab = 'orders' | 'cases' | 'offers' | 'statements'
const tabs: Array<{ value: PaymentsTab; label: string }> = [
  { value: 'orders', label: '订单管理' }, { value: 'cases', label: '待处理' },
  { value: 'offers', label: '课程商品' }, { value: 'statements', label: '账单对账' },
]

export function PaymentsWorkspace({ token }: { token: string }) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<PaymentsTab>('orders')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setSummary(await commerceApi.finance(token)) }
    catch (problem) { setError(problem instanceof Error ? problem.message : '收退款暂时无法加载') }
    finally { setLoading(false) }
  }, [token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  // Pull channel results first, then compare ledgers, so one action leaves the workspace current.
  async function syncAndReconcile() {
    setLoading(true); setError(''); setNotice('')
    try {
      const recovered = await commerceApi.recover(token)
      const reconciled = await commerceApi.reconcile(token)
      const pending = recovered.orders.unresolved + recovered.refunds.unresolved
      setNotice(`同步完成：${pending ? `${pending} 笔仍在处理` : '收退款结果已更新'}，${reconciled.findings.length ? `发现 ${reconciled.findings.length} 项渠道差异，请到「待处理」查看` : '渠道记录一致'}`)
      setSummary(await commerceApi.finance(token))
    } catch (problem) { setError(problem instanceof Error ? problem.message : '同步尚未完成') }
    finally { setLoading(false) }
  }
  return <WorkspacePanel>
    <PageHeader title="收款与退款" description="订单收款、原路退款与渠道对账" eyebrow="财务" icon={viewBusinessIcons.payments} actions={<div className="flex flex-wrap gap-2">
      <IconButton label="刷新收退款" icon={<RefreshCw className="h-4 w-4" />} disabled={loading} onClick={() => void load()} />
      <Button variant="secondary" icon={<CheckCheck />} disabled={loading} onClick={() => void syncAndReconcile()}>同步并核对</Button>
    </div>} />
    {summary?.provider === 'mock' ? <p className="border-b border-[var(--border)] bg-[var(--warning-soft)] px-4 py-3 text-sm">模拟支付环境 · 以下金额不代表真实公司收款，历史线下转账不计入</p> : null}
    {notice ? <p role="status" className="px-4 py-3 text-sm">{notice}</p> : null}
    <AsyncState error={error} loading={loading && !summary} loadingLabel="正在核对收退款..." onRetry={() => void load()}>
      {summary ? <SummaryBand><SummaryMetric label="累计收款" value={money(summary.captured)} /><SummaryMetric label="已退金额" value={money(summary.refunded)} /><SummaryMetric label="退款处理中" value={money(summary.refundReserved)} /><SummaryMetric label="渠道结算到账" value={money(summary.settled)} /></SummaryBand> : null}
    </AsyncState>
    <div className="overflow-x-auto px-4"><Tabs label="收退款视图" onChange={setTab} value={tab} options={tabs} /></div>
    {tab === 'orders' ? <CommerceOrders token={token} mockEnabled={Boolean(summary?.mockEnabled)} /> : null}
    {tab === 'cases' ? <CommerceCases token={token} /> : null}
    {tab === 'offers' ? <CommerceOffers token={token} /> : null}
    {tab === 'statements' ? <CommerceStatements token={token} /> : null}
  </WorkspacePanel>
}
