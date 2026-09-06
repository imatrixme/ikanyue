import { ChevronLeft, ChevronRight, Search, RotateCcw, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi, money, orderLabel, type OrderPage, type OrderDetail } from '../../app/commerceApi'
import { Button } from '../ui/Button'
import { IconButton, Textarea } from '../ui/Controls'
import { DialogShell } from '../ui/DialogShell'
import { AsyncState } from '../ui/DataDisplay'

export const commerceInput = 'min-h-9 min-w-0 rounded border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm'
export function CommerceOrders({ token }: { token: string }) {
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' })
  const [query, setQuery] = useState({ ...filters, page: '1' })
  const [data, setData] = useState<OrderPage | null>(null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState('')
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const request = ++sequence.current; setBusy(true); setError('')
    try { const result = await commerceApi.orders(token, query); if (request === sequence.current) setData(result) }
    catch (error) { if (request === sequence.current) setError(error instanceof Error ? error.message : '订单加载失败') }
    finally { if (request === sequence.current) setBusy(false) }
  }, [token, query])
  useEffect(() => { const guard = sequence; const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); guard.current++ } }, [load])
  return <div className="p-4">
    <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setQuery({ ...filters, page: '1' }) }}>
      <label className="grid min-w-0 flex-1 gap-1 text-xs">查找订单<input className={commerceInput} placeholder="姓名、手机号、课程或订单号" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <label className="grid gap-1 text-xs">订单状态<select className={commerceInput} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option><option value="pending">待付款</option><option value="granting">课时待到账</option><option value="completed">已完成</option><option value="refunding">退款处理中</option><option value="failed">付款未完成</option></select></label>
      <label className="grid gap-1 text-xs">开始日期<input type="date" className={commerceInput} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label className="grid gap-1 text-xs">结束日期<input type="date" className={commerceInput} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <IconButton type="submit" label="搜索订单" icon={<Search />} disabled={busy} />
    </form>
    <AsyncState error={error} loading={busy && !data} loadingLabel="正在查找订单..." onRetry={() => void load()}>
      {!data?.items.length ? <p className="py-8 text-center text-sm">没有符合条件的订单</p> : <div className="divide-y divide-[var(--border)]">{data.items.map((order) => <button key={order.id} className="grid w-full gap-2 py-4 text-left sm:grid-cols-[1fr_auto]" onClick={() => setSelected(order.id)}>
        <span><strong>{order.student.name}</strong><span className="ml-2 text-sm text-[var(--muted-foreground)]">{order.student.cellphone}</span><span className="mt-1 block text-sm">{order.name}</span></span>
        <span className="text-sm sm:text-right"><strong>{money(order.amount)}</strong><span className="block">{orderLabel(order)}</span><span className="block text-xs text-[var(--muted-foreground)]">{new Date(order.createdAt).toLocaleString('zh-CN')}</span></span>
      </button>)}</div>}
    </AsyncState>
    {data ? <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>共 {data.totalItems} 笔 · 第 {data.page} / {Math.max(1, data.totalPages)} 页</span><div className="flex gap-2"><IconButton label="上一页订单" icon={<ChevronLeft />} disabled={busy || data.page <= 1} onClick={() => setQuery({ ...query, page: String(data.page - 1) })} /><IconButton label="下一页订单" icon={<ChevronRight />} disabled={busy || data.page >= data.totalPages} onClick={() => setQuery({ ...query, page: String(data.page + 1) })} /></div></div> : null}
    {selected ? <CommerceOrderDialog key={selected} token={token} id={selected} onClose={() => { setSelected(''); void load() }} /> : null}
  </div>
}
export function CommerceOrderDialog({ token, id, onClose }: { token: string; id: string; onClose: () => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const load = useCallback(async () => { try { setOrder(await commerceApi.order(token, id)) } catch (error) { setError(error instanceof Error ? error.message : '订单加载失败') } }, [token, id])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); key.current = crypto.randomUUID(); await load(); setReason('') }
    catch (error) { setError(error instanceof Error ? error.message : '操作未完成'); await load() }
    finally { setBusy(false) }
  }
  return <DialogShell title="课程订单" onRequestClose={onClose} dismissible={!busy} size="wide">
    <div className="space-y-5 p-5">{error && order ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}<AsyncState error={order ? '' : error} loading={!order && !error} loadingLabel="正在加载订单..." onRetry={() => void load()}>
      {order ? <>
        <div><h3 className="font-semibold">{order.student.name} · {order.name}</h3><p className="mt-1 text-sm">{order.student.cellphone} · {orderLabel(order)}</p><p className="mt-2 text-sm">订单金额 {money(order.amount)} · 已退款 {money(order.refunded)}</p></div>
        {order.paymentUnavailable ? <p role="alert" className="text-sm text-[var(--destructive)]">支付渠道暂不可用，金额未重新核实</p> : null}
        {order.cancellationFees ? <p className="text-sm">取消预约扣费 {money(order.cancellationFees)}</p> : null}
        <div><h4 className="mb-2 font-medium">课程使用情况</h4>{order.batches.map((batch) => <p key={batch.id} className="py-1 text-sm">{batch.name}：剩余 {batch.available} · 已预约 {batch.reserved} · 已使用 {batch.consumed} · 已退回或停用 {batch.reversed}</p>)}</div>
        <div className="border-y border-[var(--border)] py-4"><h4 className="font-semibold">退还剩余课时 {money(order.quote.amount)}</h4><p className="my-2 text-sm">{order.quote.message}</p><label className="grid gap-2 text-sm">处理原因<Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="mt-3 flex flex-wrap gap-2"><Button icon={<RotateCcw />} disabled={busy || order.quote.blocked || order.quote.amount <= 0 || reason.trim().length < 2} onClick={() => {
            if (window.confirm(`确认向 ${order.student.name} 原路退款 ${money(order.quote.amount)}？相应剩余课时将暂停使用。`)) void run(() => commerceApi.refundOrder(token, id, { key: key.current, expectedAmount: order.quote.amount, reason }))
          }}>确认退款</Button><Button variant="secondary" icon={<RefreshCw />} disabled={busy || reason.trim().length < 2} onClick={() => void run(() => commerceApi.recoverOrder(token, id, reason))}>重试结果同步</Button></div>
        </div>
        <div><h4 className="mb-2 font-medium">退款记录</h4>{order.refunds.length ? order.refunds.map((refund) => <div key={refund.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><p>{money(refund.amount)} · {({ processing: '处理中', succeeded: '已退款', failed: '退款失败' } as Record<string, string>)[refund.status]} · {refund.actor?.reason || '学员退款'}</p>{refund.kind === 'reservation' && refund.status === 'failed' ? <Button variant="secondary" icon={<RefreshCw />} disabled={busy || reason.trim().length < 2} onClick={() => void run(() => commerceApi.retryRefund(token, refund.id, reason))}>重试原路退款</Button> : null}</div>) : <p className="text-sm">暂无退款</p>}</div>
        <div><h4 className="mb-2 font-medium">操作记录</h4>{order.audit.map((entry) => <p key={entry.id} className="py-1 text-sm">{new Date(entry.createdAt).toLocaleString('zh-CN')} · {entry.actorName || '历史操作人'} · {entry.reason}</p>)}</div>
        <details className="text-xs text-[var(--muted-foreground)]"><summary>订单凭证</summary><p className="break-all">{id}</p></details>
      </> : null}
    </AsyncState></div>
  </DialogShell>
}
