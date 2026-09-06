import { Download, Upload, CheckCheck, FileCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi, money, findingLabel, type Statement, type StatementDetail } from '../../app/commerceApi'
import { AsyncState } from '../ui/DataDisplay'
import { Button } from '../ui/Button'
import { DialogShell } from '../ui/DialogShell'
import { commerceInput } from './CommerceOrders'

export function CommerceStatements({ token }: { token: string }) {
  const [items, setItems] = useState<Statement[] | null>(null)
  const [detail, setDetail] = useState<StatementDetail | null>(null)
  const [date, setDate] = useState(() => new Date(Date.now() - 86400000 + 8 * 3600000).toISOString().slice(0, 10))
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setItems((await commerceApi.statements(token)).items) } catch (error) { setError(error instanceof Error ? error.message : '账单加载失败') } }, [token])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await load() } catch (error) { setError(error instanceof Error ? error.message : '操作失败') } finally { setBusy(false) } }
  async function exportFile() {
    if (!detail) return
    const result = await commerceApi.exportStatement(token, detail.id)
    const url = URL.createObjectURL(new Blob([result.content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `kanyue-${detail.date}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="space-y-4 p-4"><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">账单日期<input type="date" className={commerceInput} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <Button icon={<Download />} disabled={busy || !date} onClick={() => void act(async () => setDetail(await commerceApi.downloadStatement(token, date)))}>下载并核对</Button>
    <label className="grid min-w-0 max-w-full gap-1 text-sm"><span className="flex items-center gap-1"><Upload className="h-4 w-4" />导入微信交易账单</span><input type="file" accept=".csv,.txt" className="max-w-full text-xs" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
      void act(async () => { if (file.size > 1024 * 1024) throw new Error('账单不能超过1MB'); setDetail(await commerceApi.importStatement(token, date, await file.text())) })
    }} /></label></div>
    {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
    <AsyncState loading={!items && !error} loadingLabel="正在加载账单..." onRetry={() => void load()}>
      <div className="divide-y divide-[var(--border)]">{items?.map((item) => <button className="flex w-full flex-wrap justify-between gap-2 py-4 text-left" key={item.id} onClick={() => void act(async () => setDetail(await commerceApi.statement(token, item.id)))}><strong>{item.date}</strong><span className="text-sm">{item.count} 笔 · 手续费 {money(item.fees)} · {item.mock ? '模拟账单' : item.source === 'channel' ? '渠道验签下载' : '人工导入，来源待核实'}{!item.ready ? ' · 导入未完成' : ''}</span></button>)}{items?.length === 0 ? <p className="py-8 text-center text-sm">暂无已导入账单</p> : null}</div>
    </AsyncState>
    {detail ? <DialogShell title={`${detail.date} 账单核对`} onRequestClose={() => setDetail(null)} dismissible={!busy} size="wide"><div className="space-y-4 p-5">
      {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
      <p className="text-sm">收款 {money(detail.captured)} · 申请退款 {money(detail.refundRequested)} · 手续费 {money(detail.fees)}</p>
      <p className="text-sm">交易账单不代表银行到账；退款状态为出账时快照。</p>
      {detail.missingPayments.length ? <p role="alert" className="text-sm text-[var(--destructive)]">{detail.missingPayments.length} 笔收款未出现在该日账单中</p> : null}
      {detail.missingRefunds?.length ? <p role="alert" className="text-sm text-[var(--destructive)]">{detail.missingRefunds.length} 笔已受理退款未出现在该日账单中</p> : null}
      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)]">{detail.lines.map((line, index) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><p>第{index + 1}笔 · {line.kind === 'payment' ? '收款' : '退款'} {money(line.amount)} · {line.resolution ? '已核实' : line.difference ? findingLabel(line.difference) : '一致'}</p>{line.difference && !line.resolution ? <Button icon={<CheckCheck />} disabled={busy} onClick={() => {
        const note = window.prompt('填写核对依据'); if (note) void act(async () => { await commerceApi.resolveStatementLine(token, line.id, note); setDetail(await commerceApi.statement(token, detail.id)) })
      }}>重新核对并完成</Button> : null}</div>)}</div>
      <Button variant="secondary" icon={<Download />} disabled={busy} onClick={() => void act(exportFile)}>导出核对报告</Button>
      <SettlementForm busy={busy} onSubmit={(body) => void act(async () => { await commerceApi.recordSettlement(token, detail.id, body); setDetail(await commerceApi.statement(token, detail.id)) })} />
      {detail.settlements.map((item) => <p className="text-sm" key={item.id}>已登记银行到账 {money(item.amount)} · {item.date} · {item.reference}</p>)}
      <details className="text-xs text-[var(--muted-foreground)]"><summary>账单校验凭证</summary><p className="break-all">SHA-256 {detail.hash}</p></details>
    </div></DialogShell> : null}
  </div>
}
function SettlementForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: { date: string; amount: number; reference: string; evidenceHash: string }) => void }) {
  const [value, setValue] = useState({ date: '', amount: '', reference: '', evidenceHash: '' })
  const [error, setError] = useState('')
  const evidenceVersion = useRef(0)
  return <form className="space-y-3 border-t border-[var(--border)] pt-4" onSubmit={(event) => { event.preventDefault(); if (!busy && value.evidenceHash) onSubmit({ ...value, amount: Math.round(Number(value.amount) * 100) }) }}>
    <h3 className="font-semibold">登记银行到账凭证</h3><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">到账日期<input type="date" required className={commerceInput} value={value.date} onChange={(event) => setValue({ ...value, date: event.target.value })} /></label><label className="grid gap-1 text-xs">到账金额（元）<input type="number" required min="0" step="0.01" className={commerceInput} value={value.amount} onChange={(event) => setValue({ ...value, amount: event.target.value })} /></label><label className="grid gap-1 text-xs">银行流水号<input required pattern="[A-Za-z0-9_-]{1,100}" className={commerceInput} value={value.reference} onChange={(event) => setValue({ ...value, reference: event.target.value })} /></label><label className="grid min-w-0 gap-1 text-xs">银行回单<input type="file" className="max-w-full" onChange={async (event) => {
      const version = ++evidenceVersion.current
      setValue((current) => ({ ...current, evidenceHash: '' })); setError('')
      const file = event.target.files?.[0]; if (!file) return
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('银行回单不能超过20MB')
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        if (version === evidenceVersion.current) setValue((current) => ({ ...current, evidenceHash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') }))
      } catch (error) { if (version === evidenceVersion.current) setError(error instanceof Error ? error.message : '凭证校验失败') }
    }} /></label></div><p className="text-xs text-[var(--muted-foreground)]">仅登记回单校验值，原始回单由财务留存。</p>{error ? <p role="alert">{error}</p> : null}<Button type="submit" icon={<FileCheck />} disabled={busy || !value.evidenceHash}>确认登记到账</Button>
  </form>
}
