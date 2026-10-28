import { BellRing, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { RenewalCandidate, RenewalReason, RenewalRules, RenewalSendResult } from '../../app/courseTypes'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, ResponsiveDataRegion } from '../ui/DataDisplay'
import { useNotify } from '../ui/notifyContext'

const reasonLabels: Record<RenewalReason, string> = { low_balance: '课时不足', expiring: '即将到期', manual: '手动' }
const deliveryLabels: Record<string, string> = { sent: '微信已送达', skipped: '仅站内', failed: '微信未送达', pending: '发送中' }

// Students due for renewal; reminders go out signed 看乐教务 with no price, so nobody has to bring up money in person.
export function RenewalsWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const notify = useNotify()
  const [items, setItems] = useState<RenewalCandidate[] | null>(null)
  const [rules, setRules] = useState<RenewalRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<RenewalSendResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.listRenewals(token)
      setItems(data.items)
      setRules(data.rules)
      setSelected(new Set())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '待续费名单加载失败')
    } finally {
      setLoading(false)
    }
  }, [api, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function send(studentIds: string[]) {
    setConfirming(null)
    setSending(true)
    setError('')
    try {
      const outcome = await api.sendRenewalReminders(token, studentIds)
      setResult(outcome)
      notify(outcome.rejected ? `已发送 ${outcome.sent} 条，${outcome.rejected} 条未发送` : `已发送 ${outcome.sent} 条续费提醒`)
      await load()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '续费提醒发送失败')
    } finally {
      setSending(false)
    }
  }

  const sendable = (items || []).filter((item) => !item.remindedToday)
  const toggle = (studentId: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    return next
  })
  const allSelected = sendable.length > 0 && sendable.every((item) => selected.has(item.studentId))
  const nameOf = (studentId: string) => items?.find((item) => item.studentId === studentId)?.studentName || studentId

  const checkbox = (item: RenewalCandidate) => <input aria-label={`选择${item.studentName}`} checked={selected.has(item.studentId)} className="h-4 w-4 accent-[var(--brand)]" disabled={item.remindedToday} onChange={() => toggle(item.studentId)} type="checkbox" />
  const action = (item: RenewalCandidate) => <Button aria-label={`给${item.studentName}发送续费提醒`} className="h-8 px-2.5 text-xs" disabled={item.remindedToday || sending} onClick={() => setConfirming([item.studentId])} type="button" variant="secondary">{item.remindedToday ? '今日已提醒' : '发送提醒'}</Button>

  return (
    <WorkspacePanel>
      <PageHeader title="待续费" actions={<div className="flex flex-wrap gap-2">
        <IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新待续费名单" onClick={() => void load()} type="button" />
        <Button disabled={selected.size === 0 || sending} icon={<BellRing className="h-4 w-4" />} onClick={() => setConfirming([...selected])} type="button">发送续费提醒{selected.size ? `（${selected.size}）` : ''}</Button>
      </div>} />
      {rules ? <p className="border-b border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] sm:px-5">剩余 ≤ {rules.lowLessons} 节或 {rules.expiryDays} 天内到期的学员会在每天 10:00（上海时间）自动收到提醒，同一课程 {rules.cooldownDays} 天内不重复、每轮最多 {rules.roundLimit} 次；手动提醒每位学员每天 1 次。提醒署名“看乐教务”，只写剩余课时和到期日，不含价格。</p> : null}
      {result?.rejected ? <ul className="border-b border-[var(--border)] px-4 py-2 text-sm sm:px-5" role="status">{result.items.filter((item) => item.status === 'rejected').map((item) => <li key={item.studentId}>{nameOf(item.studentId)}：{item.message}</li>)}</ul> : null}
      <AsyncState empty={items && items.length === 0 ? <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">目前没有需要续费提醒的学员</p> : undefined} error={error} loading={loading && !items} loadingLabel="正在加载待续费名单..." onRetry={() => void load()}>
        <ResponsiveDataRegion
          desktop={<DataTable aria-label="待续费学员">
            <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="w-10 px-4 py-2 sm:px-5"><input aria-label="全选可提醒学员" checked={allSelected} className="h-4 w-4 accent-[var(--brand)]" disabled={sendable.length === 0} onChange={() => setSelected(allSelected ? new Set() : new Set(sendable.map((item) => item.studentId)))} type="checkbox" /></th>
              <th className="px-2 py-2">学员</th><th className="px-2 py-2">课程</th><th className="px-2 py-2">原因</th><th className="px-2 py-2">剩余</th><th className="px-2 py-2">到期日</th><th className="px-2 py-2">最近提醒</th><th className="px-4 py-2 text-right sm:px-5">操作</th>
            </tr></thead>
            <tbody>{(items || []).map((item) => <tr className="border-b border-[var(--border)]" key={item.studentId}>
              <td className="px-4 py-2 sm:px-5">{checkbox(item)}</td>
              <td className="px-2 py-2 font-medium">{item.studentName}</td>
              <td className="px-2 py-2">{item.courseName}</td>
              <td className="px-2 py-2"><Badge tone={item.reason === 'low_balance' ? 'amber' : 'blue'}>{reasonLabels[item.reason]}</Badge></td>
              <td className="px-2 py-2 tabular-nums">{item.remainingLessons} 节</td>
              <td className="px-2 py-2 tabular-nums">{dateOf(item.validUntil)}</td>
              <td className="px-2 py-2 text-[var(--muted-foreground)]">{lastReminderText(item)}</td>
              <td className="px-4 py-2 text-right sm:px-5">{action(item)}</td>
            </tr>)}</tbody>
          </DataTable>}
          mobile={(items || []).map((item) => <div className="flex items-start gap-3 px-4 py-3 text-sm" key={item.studentId}>
            <span className="pt-0.5">{checkbox(item)}</span>
            <span className="min-w-0 flex-1"><strong>{item.studentName}</strong> · {item.courseName}<span className="block text-[var(--muted-foreground)]">{reasonLabels[item.reason]} · 剩 {item.remainingLessons} 节 · {dateOf(item.validUntil)}</span><span className="block text-xs text-[var(--muted-foreground)]">{lastReminderText(item)}</span></span>
            {action(item)}
          </div>)}
        />
      </AsyncState>
      {confirming ? <ConfirmDialog confirmLabel="发送" description={confirming.length === 1 ? `将以“看乐教务”名义提醒 ${nameOf(confirming[0])} 查看续费课包。` : `将以“看乐教务”名义提醒 ${confirming.length} 位学员查看续费课包。`} onCancel={() => setConfirming(null)} onConfirm={() => void send(confirming)} title="发送续费提醒" /> : null}
    </WorkspacePanel>
  )
}

function dateOf(value: string | null) {
  if (!value) return '长期有效'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

function lastReminderText(item: RenewalCandidate) {
  const last = item.lastReminder
  if (!last) return '尚未提醒'
  const when = new Date(last.created).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' })
  return `${when} ${last.trigger === 'auto' ? '自动' : '手动'} · ${deliveryLabels[last.wechatStatus] || last.wechatStatus}${last.read ? ' · 已读' : ''}`
}
