import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { commerceApi, type RecoveryWork } from '../../app/commerceApi'
import { Button } from '../ui/Button'

export function CommerceRecovery({ token }: { token: string }) {
  const [rows, setRows] = useState<RecoveryWork[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void commerceApi.recoveryWork(token).then((result) => { if (active) setRows(result.items.filter((row) => row.data.exhausted)) }).catch(() => { if (active) setError('暂时无法检查自动恢复任务') }); return () => { active = false } }, [token])
  async function resume(row: RecoveryWork) {
    const reason = window.prompt('恢复自动处理的原因'); if (!reason) return
    setBusy(true); setError('')
    try { await commerceApi.resumeWork(token, row.id, reason); setRows(rows.filter((item) => item.id !== row.id)) }
    catch (error) { setError(error instanceof Error ? error.message : '恢复失败') } finally { setBusy(false) }
  }
  return <div className="border-b border-[var(--border)] pb-4">{error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}{rows.map((row) => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={row.id}><p role="alert" className="text-sm">{row.data.task === 'event-delivery' ? '结果通知' : '渠道查询'}连续失败 {row.data.attempts} 次，自动处理已暂停</p><Button icon={<RefreshCw />} disabled={busy} onClick={() => void resume(row)}>恢复自动处理</Button></div>)}</div>
}
