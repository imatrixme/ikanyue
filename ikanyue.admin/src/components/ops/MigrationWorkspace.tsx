import { CheckCircle2, RefreshCw, ScanSearch, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OpsApi } from '../../app/api'
import { viewBusinessIcons } from '../../app/businessIcons'
import type { MigrationInventory, MigrationPlan, MigrationPreview, MigrationTarget } from '../../app/migrationTypes'
import { PageHeader, SectionHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Checkbox, FormMessage, IconButton, Textarea } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { ShadowRolloutPanel } from './ShadowRolloutPanel'

export function MigrationWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [inventory, setInventory] = useState<MigrationInventory | null>(null)
  const [plan, setPlan] = useState<MigrationPlan>(emptyPlan())
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState('')
  const [jsonError, setJsonError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(''); setPreview(null); setConfirmed(false); setResult('')
    try {
      const next = await api.getMigrationInventory(token)
      setInventory(next); setPlan(draftPlan(next))
    } catch (loadError) { setError(message(loadError, '历史数据盘点失败')) }
    finally { setLoading(false) }
  }, [api, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const sourceCount = useMemo(() => inventory ? totalSources(inventory) : 0, [inventory])
  const complete = inventory ? planIsComplete(plan, inventory) : false

  async function runPreview() {
    setLoading(true); setError(''); setResult(''); setConfirmed(false)
    try { setPreview(await api.previewMigration(token, plan)) }
    catch (previewError) { setError(message(previewError, '迁移预览失败')) }
    finally { setLoading(false) }
  }

  async function apply() {
    if (!preview?.ready || !confirmed) return
    setLoading(true); setError('')
    try {
      const applied = await api.applyMigration(token, preview.plan, preview.previewHash)
      setResult(`迁移已提交，操作号 ${applied.operationId}${applied.replayed ? '（幂等重放）' : ''}`)
    } catch (applyError) { setError(message(applyError, '迁移提交失败')) }
    finally { setLoading(false) }
  }

  function update(next: MigrationPlan) {
    setPlan(next); setPreview(null); setConfirmed(false); setResult(''); setJsonError('')
  }

  function updateJson(value: string) {
    try { update(JSON.parse(value) as MigrationPlan) }
    catch { setJsonError('JSON 格式尚未完整，修正后才能预览。') }
  }

  return <WorkspacePanel><PageHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新盘点历史数据" onClick={() => void load()} type="button" />} badge={<Badge tone={preview?.ready ? 'green' : sourceCount ? 'amber' : 'green'}>{preview?.ready ? '零差异可迁移' : `${sourceCount} 条来源`}</Badge>} description="由 Admin 显式映射历史课时、学习项目和课堂；历史课堂只导入记录，不扣减课程点。" eyebrow="数据治理" icon={viewBusinessIcons.migration} title="历史数据迁移" />
    <SummaryBand><SummaryMetric label="学员旧课时" value={inventory?.totals.studentHours ?? '-'} /><SummaryMetric label="教师旧工作量" value={inventory?.totals.teacherHours ?? '-'} /><SummaryMetric label="历史项目" value={inventory?.totals.programs ?? '-'} /><SummaryMetric label="历史课堂" value={inventory?.totals.sessions ?? '-'} /></SummaryBand>
    <AsyncState error={error && !inventory ? error : ''} loading={loading && !inventory} loadingLabel="正在盘点历史课程数据..." onRetry={() => void load()}>{inventory ? <div className="grid gap-0">
      {sourceCount === 0 ? <EmptyState noun="需要迁移的历史课程数据" /> : <>
        <StudentMappings inventory={inventory} onChange={update} plan={plan} />
        <ProgramMappings inventory={inventory} onChange={update} plan={plan} />
        <SessionMappings inventory={inventory} onChange={update} plan={plan} />
        <TeacherMappings inventory={inventory} plan={plan} />
      </>}
      <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5">
        <SectionHeader description="用于拆分多个课程点批次或处理复杂历史课堂。修改后仍需重新预览。" title="高级计划编辑" />
        <Textarea aria-label="迁移计划 JSON" className="min-h-56 font-mono text-xs" onChange={(event) => updateJson(event.target.value)} value={JSON.stringify(plan, null, 2)} />
        {jsonError ? <FormMessage tone="error">{jsonError}</FormMessage> : null}
      </section>
      <section className="grid gap-4 border-t border-[var(--border)] bg-[var(--brand-wash)] px-5 py-5">
        <SectionHeader description="预览只计算映射、差异和未解释来源，不写入余额。" title="预览与提交" />
        {!complete ? <FormMessage tone="error">仍有目标课程点、项目分类或课堂字段未填写。</FormMessage> : null}
        {preview ? <PreviewReport preview={preview} /> : null}
        {error && inventory ? <FormMessage tone="error">{error}</FormMessage> : null}
        {result ? <p className="flex items-center gap-2 text-sm font-semibold text-[var(--success)]"><CheckCircle2 className="h-4 w-4" />{result}</p> : null}
        <div className="flex flex-wrap items-center gap-3"><Button disabled={loading || !complete || Boolean(jsonError)} icon={<ScanSearch className="h-4 w-4" />} onClick={() => void runPreview()} type="button" variant="secondary">生成零差异预览</Button>{preview?.ready ? <><Checkbox checked={confirmed} description="确认来源数量、目标课程点和历史课堂均已人工核对。" label="我已核对本次迁移" onChange={(event) => setConfirmed(event.target.checked)} /><Button disabled={loading || !confirmed || Boolean(result)} icon={<UploadCloud className="h-4 w-4" />} onClick={() => void apply()} type="button">提交迁移</Button></> : null}</div>
      </section>
      <ShadowRolloutPanel api={api} token={token} />
    </div> : null}</AsyncState>
  </WorkspacePanel>
}

function StudentMappings({ inventory, onChange, plan }: MappingProps) {
  if (!inventory.studentHours.length) return null
  return <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5"><SectionHeader description="每名学员必须明确选择课程点；复杂拆分可在高级计划中调整。" title="学员旧课时映射" /><ResponsiveDataRegion desktop={<DataTable><thead><Header labels={['学员', '来源课时', '目标课程点']} /></thead><tbody>{inventory.studentHours.map((source, index) => <tr className="border-b border-[var(--border)]" key={source.id}><td className="px-3 py-3"><strong>{source.label}</strong><span className="block text-xs text-[var(--muted-foreground)]">{source.id}</span></td><td className="px-3 py-3 tabular-nums">{source.hours}</td><td className="min-w-64 px-3 py-3"><Select aria-label={`${source.label}目标课程点`} onChange={(event) => onChange(withStudentCredit(plan, index, event.target.value))} options={targetOptions(inventory.targets.creditTypes)} value={plan.studentHours[index]?.allocations[0]?.creditTypeId || ''} /></td></tr>)}</tbody></DataTable>} mobile={inventory.studentHours.map((source, index) => <div className="grid gap-3 p-4" key={source.id}><strong>{source.label} · {source.hours} 课时</strong><Select aria-label={`${source.label}目标课程点`} onChange={(event) => onChange(withStudentCredit(plan, index, event.target.value))} options={targetOptions(inventory.targets.creditTypes)} value={plan.studentHours[index]?.allocations[0]?.creditTypeId || ''} /></div>)} /></section>
}

function ProgramMappings({ inventory, onChange, plan }: MappingProps) {
  if (!inventory.programs.length) return null
  return <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5"><SectionHeader description="历史学习项目必须由教务明确归类为当前课包或班级。" title="历史项目分类" /><div className="grid gap-3">{inventory.programs.map((source, index) => { const mapping = plan.programs[index]; const targets = mapping?.targetType === 'package' ? inventory.targets.packages : inventory.targets.classes; return <div className="grid gap-3 border-b border-[var(--border)] pb-4 md:grid-cols-[minmax(12rem,1fr)_10rem_minmax(14rem,1fr)]" key={source.id}><div><strong>{source.name}</strong><span className="block text-xs text-[var(--muted-foreground)]">{source.id}</span></div><Select aria-label={`${source.name}分类`} onChange={(event) => onChange(withProgramType(plan, index, event.target.value as 'class' | 'package'))} options={[{ label: '班级', value: 'class' }, { label: '课包', value: 'package' }]} value={mapping?.targetType || 'class'} /><Select aria-label={`${source.name}目标`} onChange={(event) => onChange(withProgramTarget(plan, index, event.target.value))} options={targetOptions(targets)} value={mapping?.targetId || ''} /></div> })}</div></section>
}

function SessionMappings({ inventory, onChange, plan }: MappingProps) {
  if (!inventory.sessions.length) return null
  return <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5"><SectionHeader description="历史课堂固定标记为不扣点；这里仅确认课程点类型和原始起止时间。" title="历史课堂与出勤" /><div className="grid gap-5">{inventory.sessions.map((source, index) => { const mapping = plan.sessions[index]; return <div className="grid gap-3 border-b border-[var(--border)] pb-5" key={source.id}><div><strong>{source.title}</strong><span className="block text-xs text-[var(--muted-foreground)]">{source.id}</span></div><div className="grid gap-3 md:grid-cols-3"><Field label="目标课程点"><Select aria-label={`${source.title}目标课程点`} onChange={(event) => onChange(withSession(plan, index, { requiredCreditTypeId: event.target.value }))} options={targetOptions(inventory.targets.creditTypes)} value={mapping?.requiredCreditTypeId || ''} /></Field><Field label="开始时间"><Input aria-label={`${source.title}开始时间`} onChange={(event) => onChange(withSession(plan, index, { startAt: event.target.value }))} type="datetime-local" value={localDateTime(mapping?.startAt)} /></Field><Field label="结束时间"><Input aria-label={`${source.title}结束时间`} onChange={(event) => onChange(withSession(plan, index, { endAt: event.target.value }))} type="datetime-local" value={localDateTime(mapping?.endAt)} /></Field></div></div> })}</div></section>
}

function TeacherMappings({ inventory, plan }: { inventory: MigrationInventory; plan: MigrationPlan }) {
  if (!inventory.teacherHours.length) return null
  return <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5"><SectionHeader description="教师旧工作量按原值生成独立调整事件，不伪造课堂结算。" title="教师工作量调整" /><div className="grid gap-2">{inventory.teacherHours.map((source, index) => <p className="flex justify-between border-b border-[var(--border)] py-2 text-sm" key={source.id}><span>{source.label}<span className="ml-2 text-xs text-[var(--muted-foreground)]">{source.id}</span></span><strong className="tabular-nums">{plan.teacherHours[index]?.quantity ?? source.hours}</strong></p>)}</div></section>
}

function PreviewReport({ preview }: { preview: MigrationPreview }) {
  const unmapped = Object.values(preview.report.unmapped).reduce((sum, items) => sum + items.length, 0)
  return <div className="grid gap-3 border-y border-[var(--border)] bg-[var(--card)] px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{preview.ready ? '预览通过：零未解释差异' : '预览未通过'}</strong><Badge tone={preview.ready ? 'green' : 'red'}>{preview.report.differences.length} 个数量差异 · {unmapped} 个未映射来源</Badge></div>{preview.report.differences.map((item) => <p className="text-sm text-[var(--destructive)]" key={`${item.type}:${item.sourceId}`}>{item.sourceId}：来源 {item.sourceQuantity}，映射 {item.mappedQuantity}，差异 {item.difference}</p>)}</div>
}

interface MappingProps { inventory: MigrationInventory; onChange: (plan: MigrationPlan) => void; plan: MigrationPlan }
function Header({ labels }: { labels: string[] }) { return <tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">{labels.map((label) => <th className="px-3 py-3" key={label}>{label}</th>)}</tr> }
function targetOptions(items: MigrationTarget[]) { return items.map((item) => ({ label: `${item.name}${item.code ? ` · ${item.code}` : ''}`, value: item.id })) }

function draftPlan(inventory: MigrationInventory): MigrationPlan {
  return {
    studentHours: inventory.studentHours.map((source) => ({ studentId: source.id, allocations: [{ activationMode: 'GRANT_TIME', creditTypeId: '', expiryPolicy: 'NO_EXPIRY', quantity: source.hours, reason: '管理员核对历史学员课时' }] })),
    teacherHours: inventory.teacherHours.map((source) => ({ teacherId: source.id, quantity: source.hours, reason: '管理员核对历史教师工作量' })),
    programs: inventory.programs.map((source) => ({ legacyProgramId: source.id, targetType: 'class', targetId: '', reason: '教务人工确认历史项目分类' })),
    sessions: inventory.sessions.map((source) => ({ legacySessionId: source.id, title: source.title, startAt: source.startAt, endAt: source.endAt, requiredCreditTypeId: '', requiredQuantity: 1, reason: '历史课堂无扣点导入', attendanceRecordIds: inventory.attendance.filter((item) => item.sessionId === source.id).map((item) => item.id), attendees: inventory.attendance.filter((item) => item.sessionId === source.id && item.studentId).map((item) => ({ studentId: item.studentId, attendanceStatus: normalizedAttendance(item.status) })), teachers: source.teacherId ? [{ teacherId: source.teacherId, role: 'lead', actualStatus: 'confirmed' }] : [] })),
  }
}

function emptyPlan(): MigrationPlan { return { programs: [], sessions: [], studentHours: [], teacherHours: [] } }
function totalSources(inventory: MigrationInventory) { return inventory.totals.students + inventory.totals.teachers + inventory.totals.programs + inventory.totals.sessions + inventory.totals.attendance }
function planIsComplete(plan: MigrationPlan, inventory: MigrationInventory) { return plan.studentHours.length === inventory.studentHours.length && plan.studentHours.every((item) => item.allocations.length > 0 && item.allocations.every((allocation) => allocation.creditTypeId && Number.isInteger(allocation.quantity) && allocation.quantity > 0)) && plan.teacherHours.length === inventory.teacherHours.length && plan.programs.length === inventory.programs.length && plan.programs.every((item) => item.targetId) && plan.sessions.length === inventory.sessions.length && plan.sessions.every((item) => item.requiredCreditTypeId && item.startAt && item.endAt) }
function withStudentCredit(plan: MigrationPlan, index: number, creditTypeId: string) { const next = structuredClone(plan); next.studentHours[index].allocations[0].creditTypeId = creditTypeId; return next }
function withProgramType(plan: MigrationPlan, index: number, targetType: 'class' | 'package') { const next = structuredClone(plan); next.programs[index].targetType = targetType; next.programs[index].targetId = ''; return next }
function withProgramTarget(plan: MigrationPlan, index: number, targetId: string) { const next = structuredClone(plan); next.programs[index].targetId = targetId; return next }
function withSession(plan: MigrationPlan, index: number, changes: Partial<MigrationPlan['sessions'][number]>) { const next = structuredClone(plan); Object.assign(next.sessions[index], changes); return next }
function normalizedAttendance(value: string) { return ['present', 'late', 'leave', 'absent', 'cancelled'].includes(value) ? value : 'present' }
function localDateTime(value?: string) { if (!value || !Number.isFinite(Date.parse(value))) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
