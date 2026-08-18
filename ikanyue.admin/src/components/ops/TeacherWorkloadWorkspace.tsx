import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import { viewBusinessIcons } from '../../app/businessIcons'
import type { CourseRecord } from '../../app/courseTypes'
import { PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion, Tabs } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { Field, Input } from '../ui/Input'

type WorkloadStatus = 'pending' | 'confirmed' | 'reversed'

export function TeacherWorkloadWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [status, setStatus] = useState<WorkloadStatus>('pending')
  const [items, setItems] = useState<CourseRecord[]>([])
  const [reviewing, setReviewing] = useState<CourseRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems((await api.listCourseResource(token, 'teacherEvents', { page: 1, perPage: 100, status })).items) }
    catch (loadError) { setError(message(loadError, '加载教师工作量失败')) }
    finally { setLoading(false) }
  }, [api, status, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function confirm(reason: string) {
    if (!reviewing) return
    setLoading(true); setError('')
    try {
      await api.confirmTeacherCredit(token, reviewing.id, reason)
      setReviewing(null)
      await load()
    } catch (commandError) {
      setError(message(commandError, '确认教师工作量失败'))
      setLoading(false)
    }
  }

  return <WorkspacePanel>
    <PageHeader
      actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新教师工作量" onClick={() => void load()} type="button" />}
      badge={<Badge tone={status === 'pending' && items.length ? 'amber' : 'green'}>{items.length} 条{statusLabel(status)}</Badge>}
      description="按确认状态核对课堂产生的教师工作量；Admin 可在复核课堂、教师、数量与原因后代为确认。"
      eyebrow="教师结算"
      icon={viewBusinessIcons.teachers}
      title="教师工作量"
    />
    <SummaryBand>
      <SummaryMetric label={statusLabel(status)} value={items.length} />
      <SummaryMetric label="当前工作量" value={sum(items)} />
    </SummaryBand>
    <div className="px-4 sm:px-5"><Tabs label="教师工作量状态" onChange={setStatus} options={[{ label: '待确认', value: 'pending' }, { label: '已确认', value: 'confirmed' }, { label: '已撤销', value: 'reversed' }]} value={status} /></div>
    <AsyncState empty={items.length === 0 ? <EmptyState noun={`${statusLabel(status)}教师工作量`} /> : undefined} error={error} loading={loading && items.length === 0} loadingLabel="正在加载教师工作量..." onRetry={() => void load()}>
      <ResponsiveDataRegion desktop={<WorkloadTable items={items} onReview={setReviewing} status={status} />} mobile={items.map((item) => <WorkloadCard item={item} key={item.id} onReview={setReviewing} status={status} />)} />
    </AsyncState>
    {reviewing ? <TeacherCreditReviewDialog event={reviewing} loading={loading} onCancel={() => setReviewing(null)} onConfirm={confirm} /> : null}
  </WorkspacePanel>
}

function WorkloadTable({ items, onReview, status }: { items: CourseRecord[]; onReview: (item: CourseRecord) => void; status: WorkloadStatus }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">教师</th><th className="px-4 py-3">课堂教师记录</th><th className="px-4 py-3">事件</th><th className="px-4 py-3">工作量</th><th className="px-4 py-3">原因</th><th className="px-4 py-3">时间</th>{status === 'pending' ? <th className="px-4 py-3 text-right">操作</th> : null}</tr></thead><tbody>{items.map((item) => <tr className="border-b border-[var(--border)]" key={item.id}><td className="px-4 py-3 font-semibold">{value(item.teacherId)}</td><td className="px-4 py-3">{value(item.sessionTeacherId)}</td><td className="px-4 py-3">{eventLabel(item.eventType)}</td><td className="px-4 py-3 tabular-nums">{value(item.quantityDelta)}</td><td className="px-4 py-3">{value(item.reason, '待填写')}</td><td className="px-4 py-3">{value(item.created, '-')}</td>{status === 'pending' ? <td className="px-4 py-3 text-right"><Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => onReview(item)} type="button">复核确认</Button></td> : null}</tr>)}</tbody></DataTable>
}

function WorkloadCard({ item, onReview, status }: { item: CourseRecord; onReview: (item: CourseRecord) => void; status: WorkloadStatus }) {
  return <article className="grid gap-2 p-4"><div className="flex items-start justify-between gap-3"><div><strong>教师 {value(item.teacherId)}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">课堂记录 {value(item.sessionTeacherId)}</p></div><Badge tone={status === 'pending' ? 'amber' : 'green'}>{value(item.quantityDelta)} 点</Badge></div><p className="text-sm text-[var(--muted-foreground)]">{eventLabel(item.eventType)} · {value(item.reason, '暂无原因')}</p>{status === 'pending' ? <Button className="justify-self-start" onClick={() => onReview(item)} type="button">复核确认</Button> : null}</article>
}

function TeacherCreditReviewDialog({ event, loading, onCancel, onConfirm }: { event: CourseRecord; loading: boolean; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('课堂工作量已由教务核对')
  const valid = reason.trim().length >= 4
  return <DialogShell description="确认会生成新的不可变确认事件，不会覆盖原始课堂收益记录。" onRequestClose={onCancel} title="确认教师工作量"><form className="grid gap-5 p-5" onSubmit={(event_) => { event_.preventDefault(); if (valid) void onConfirm(reason.trim()) }}><SummaryBand><SummaryMetric label="教师" value={value(event.teacherId)} /><SummaryMetric label="课堂教师记录" value={value(event.sessionTeacherId)} /><SummaryMetric label="确认数量" value={value(event.quantityDelta)} /></SummaryBand><Field htmlFor="teacher-credit-reason" hint="至少 4 个字符，将写入审计与确认事件。" label="确认原因"><Input id="teacher-credit-reason" onChange={(input) => setReason(input.target.value)} required value={reason} /></Field><div className="flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="secondary">返回核对</Button><Button disabled={loading || !valid} type="submit">确认工作量</Button></div></form></DialogShell>
}

function sum(items: CourseRecord[]) { return items.reduce((total, item) => total + Number(item.quantityDelta || 0), 0) }
function statusLabel(status: WorkloadStatus) { return ({ pending: '待确认', confirmed: '已确认', reversed: '已撤销' } as const)[status] }
function eventLabel(event: unknown) { return ({ earn: '课堂收益', compensate: '补偿', confirm: '确认', reverse: '撤销', adjust: '调整' } as Record<string, string>)[String(event)] || String(event || '-') }
function value(input: unknown, fallback = '未知') { return input === undefined || input === null || input === '' ? fallback : String(input) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
