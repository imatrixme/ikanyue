import { CheckCheck, RefreshCw, Save, FileSearch } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { commerceApi, type CommerceCase } from '../../app/commerceApi'
import { AsyncState } from '../ui/DataDisplay'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Controls'
import { CommerceRecovery } from './CommerceRecovery'
import { CommerceOrderDialog } from './CommerceOrders'

export function CommerceCases({ token }: { token: string }) {
  const [items, setItems] = useState<CommerceCase[] | null>(null); const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState('')
  const load = useCallback(async () => { try { setItems(await commerceApi.cases(token)); setError('') } catch (error) { setError(error instanceof Error ? error.message : '异常记录加载失败') } }, [token])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await load() } catch (error) { setError(error instanceof Error ? error.message : '处理失败') } finally { setBusy(false) } }
  return <div className="p-4"><CommerceRecovery token={token} />{items ? <p role="status" className="mb-4 text-sm">待处理 {items.filter((item) => item.status === 'open').length} 项</p> : null}
    {error && items ? <p role="alert" className="mb-4 text-sm text-[var(--destructive)]">{error}</p> : null}
    <AsyncState loading={!items && !error} error={items ? '' : error} loadingLabel="正在检查异常..." onRetry={() => void load()}><div className="divide-y divide-[var(--border)]">
      {items?.map((item) => <CaseRow key={`${item.id}:${item.note}:${item.status}`} item={item} busy={busy} openOrder={() => setSelectedOrder(item.orderId)} review={(note, status) => void act(() => commerceApi.reviewCase(token, item.id, status, note))} recover={(note) => void act(() => commerceApi.recoverOrder(token, item.orderId, note))} />)}
      {items?.length === 0 ? <p className="py-8 text-center text-sm">暂无待处理异常</p> : null}
    </div></AsyncState>
    {selectedOrder ? <CommerceOrderDialog key={selectedOrder} token={token} id={selectedOrder} onClose={() => { setSelectedOrder(''); void load() }} /> : null}
  </div>
}
function CaseRow({ item, busy, review, recover, openOrder }: { item: CommerceCase; busy: boolean; review: (note: string, status: string) => void; recover: (note: string) => void; openOrder: () => void }) {
  const [note, setNote] = useState(item.note)
  return <div className="space-y-3 py-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.label}</h3><span className="text-sm">{item.status === 'resolved' ? '已处理' : '待处理'}</span></div><p className="text-xs text-[var(--muted-foreground)]">{new Date(item.createdAt).toLocaleString('zh-CN')}</p>
    {item.student ? <p className="text-sm">{item.student.name} · {item.student.cellphone} · {item.orderName}</p> : null}
    {item.orderId ? <Button variant="secondary" icon={<FileSearch />} onClick={openOrder}>查看关联订单</Button> : null}
    <label className="grid gap-1 text-sm">处理记录<Textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<Save />} disabled={busy || note.trim().length < 2} onClick={() => review(note, item.status)}>保存记录</Button>{item.orderId ? <Button variant="secondary" icon={<RefreshCw />} disabled={busy || note.trim().length < 2} onClick={() => recover(note)}>同步订单结果</Button> : null}{item.status !== 'resolved' ? <Button icon={<CheckCheck />} disabled={busy || note.trim().length < 2} onClick={() => review(note, 'resolved')}>核实并完成</Button> : null}</div>
  </div>
}
