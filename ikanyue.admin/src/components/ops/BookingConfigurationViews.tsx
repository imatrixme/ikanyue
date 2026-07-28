import { Clock3, Edit3, Plus, RefreshCw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingAvailability, BookingAvailabilityOverride, BookingOffering, BookingOfferingInput, BookingPolicy, BookingPolicyInput, BookingReferenceData, BookingWeeklyRule } from '../../app/bookingTypes'
import { SectionHeader } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton, SegmentedControl } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { Select } from '../ui/Select'
import { BookingOfferingDialog, BookingOverrideDialog, BookingPolicyDialog, BookingWeeklyRulesDialog } from './BookingConfigurationDialogs'

type ConfigurationSection = 'policies' | 'offerings' | 'availability'

export function BookingConfigurationViews({ api, referenceData, token }: { api: OpsApi; referenceData: BookingReferenceData; token: string }) {
  const [section, setSection] = useState<ConfigurationSection>('offerings')
  const [policies, setPolicies] = useState<BookingPolicy[]>([])
  const [offerings, setOfferings] = useState<BookingOffering[]>([])
  const [selectedOfferingId, setSelectedOfferingId] = useState('')
  const [availability, setAvailability] = useState<BookingAvailability>({ rules: [], overrides: [] })
  const [policyBase, setPolicyBase] = useState<BookingPolicy | null | undefined>(undefined)
  const [offeringEditor, setOfferingEditor] = useState<BookingOffering | null | undefined>(undefined)
  const [weeklyEditor, setWeeklyEditor] = useState(false)
  const [overrideEditor, setOverrideEditor] = useState(false)
  const [cancelOverride, setCancelOverride] = useState<BookingAvailabilityOverride | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadConfiguration = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [policyPage, offeringPage] = await Promise.all([
        api.listBookingPolicies(token, { page: 1, perPage: 100 }),
        api.listBookingOfferings(token, { page: 1, perPage: 100 }),
      ])
      setPolicies(policyPage.items)
      setOfferings(offeringPage.items)
      setSelectedOfferingId((current) => current || offeringPage.items[0]?.id || '')
    } catch (loadError) { setError(message(loadError, '加载预约配置失败')) }
    finally { setLoading(false) }
  }, [api, token])

  const loadAvailability = useCallback(async () => {
    if (!selectedOfferingId) { setAvailability({ rules: [], overrides: [] }); return }
    setLoading(true)
    try { setAvailability(await api.getBookingAvailability(token, { offeringId: selectedOfferingId })) }
    catch (loadError) { setError(message(loadError, '加载教师开放时间失败')) }
    finally { setLoading(false) }
  }, [api, selectedOfferingId, token])

  useEffect(() => { const timer = window.setTimeout(() => void loadConfiguration(), 0); return () => window.clearTimeout(timer) }, [loadConfiguration])
  useEffect(() => { if (section !== 'availability') return; const timer = window.setTimeout(() => void loadAvailability(), 0); return () => window.clearTimeout(timer) }, [loadAvailability, section])

  async function savePolicy(data: BookingPolicyInput) {
    await run(async () => { await api.createBookingPolicy(token, data); setPolicyBase(undefined); await loadConfiguration() }, '保存预约策略失败')
  }
  async function saveOffering(data: BookingOfferingInput) {
    await run(async () => { await api.saveBookingOffering(token, offeringEditor?.id || null, data); setOfferingEditor(undefined); await loadConfiguration() }, '保存预约课程失败')
  }
  async function saveWeekly(rules: BookingWeeklyRule[]) {
    if (!selectedOfferingId) return
    await run(async () => { await api.saveBookingWeeklyAvailability(token, selectedOfferingId, rules); setWeeklyEditor(false); await Promise.all([loadAvailability(), loadConfiguration()]) }, '保存每周开放时间失败')
  }
  async function saveOverride(data: Omit<BookingAvailabilityOverride, 'id' | 'teacherId' | 'offeringId' | 'status'>) {
    if (!selectedOfferingId) return
    await run(async () => { await api.createBookingAvailabilityOverride(token, selectedOfferingId, data); setOverrideEditor(false); await loadAvailability() }, '保存日期例外失败')
  }
  async function confirmCancelOverride() {
    if (!cancelOverride) return
    await run(async () => { await api.cancelBookingAvailabilityOverride(token, cancelOverride.id); setCancelOverride(null); await loadAvailability() }, '撤销日期例外失败')
  }
  async function run(action: () => Promise<void>, fallback: string) {
    setLoading(true); setError('')
    try { await action() } catch (actionError) { setError(message(actionError, fallback)); setLoading(false) }
  }

  const activeRules = availability.rules.filter((rule) => !rule.status || rule.status === 'active')
  const selectedOffering = offerings.find((item) => item.id === selectedOfferingId)
  const dialogReferenceData = useMemo(() => ({ ...referenceData, policies: policies.filter((item) => item.status === 'active') }), [policies, referenceData])

  return <div><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><SegmentedControl label="预约配置模块" onChange={setSection} options={[{ label: '教师课程', value: 'offerings' }, { label: '开放时间', value: 'availability' }, { label: '预约策略', value: 'policies' }]} value={section} /><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新预约配置" onClick={() => void loadConfiguration()} type="button" /></div>{error ? <p className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--destructive)]">{error}</p> : null}{section === 'policies' ? <PolicySection loading={loading} onCreate={() => setPolicyBase(null)} onRevise={setPolicyBase} policies={policies} /> : null}{section === 'offerings' ? <OfferingSection loading={loading} offerings={offerings} onCreate={() => setOfferingEditor(null)} onEdit={setOfferingEditor} /> : null}{section === 'availability' ? <AvailabilitySection availability={availability} loading={loading} offerings={offerings} onAddOverride={() => setOverrideEditor(true)} onCancelOverride={setCancelOverride} onEditWeekly={() => setWeeklyEditor(true)} onOfferingChange={setSelectedOfferingId} selectedOfferingId={selectedOfferingId} /> : null}{policyBase !== undefined ? <BookingPolicyDialog base={policyBase || undefined} loading={loading} onClose={() => setPolicyBase(undefined)} onSave={savePolicy} /> : null}{offeringEditor !== undefined ? <BookingOfferingDialog loading={loading} offering={offeringEditor || undefined} onClose={() => setOfferingEditor(undefined)} onSave={saveOffering} referenceData={dialogReferenceData} /> : null}{weeklyEditor ? <BookingWeeklyRulesDialog loading={loading} onClose={() => setWeeklyEditor(false)} onSave={saveWeekly} rules={activeRules} /> : null}{overrideEditor ? <BookingOverrideDialog loading={loading} onClose={() => setOverrideEditor(false)} onSave={saveOverride} /> : null}{cancelOverride ? <ConfirmDialog confirmLabel="确认撤销" description={`${formatDateTime(cancelOverride.startAt)} 的日期例外将不再生效。`} onCancel={() => setCancelOverride(null)} onConfirm={() => void confirmCancelOverride()} title="撤销日期例外" /> : null}{selectedOffering && section === 'availability' ? <span className="sr-only">正在维护 {selectedOffering.teacher.name} 的 {selectedOffering.course.name}</span> : null}</div>
}

function PolicySection({ loading, onCreate, onRevise, policies }: { loading: boolean; onCreate: () => void; onRevise: (policy: BookingPolicy) => void; policies: BookingPolicy[] }) {
  return <AsyncState empty={!policies.length ? <EmptyState noun="预约策略" onCreate={onCreate} /> : undefined} loading={loading && !policies.length} loadingLabel="正在加载预约策略..."><div className="border-b border-[var(--border)] px-4 py-4"><SectionHeader actions={<Button icon={<Plus className="h-4 w-4" />} onClick={onCreate} type="button">新增策略</Button>} description="策略采用版本化发布，已发起预约不会被新版本静默改写。" title="机构预约策略" /></div><ResponsiveDataRegion desktop={<DataTable><thead><tr className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">策略</th><th className="px-4 py-3">机构时段</th><th className="px-4 py-3">提前与期限</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{policies.map((policy) => <tr className="border-b border-[var(--border)]" key={policy.id}><td className="px-4 py-3"><p className="font-semibold">{policy.name}</p><p className="text-xs text-[var(--muted-foreground)]">{policy.code} · V{policy.version}</p></td><td className="px-4 py-3">{policy.defaultWindows.map(windowLabel).join('、')}</td><td className="px-4 py-3"><p>提前 {durationLabel(policy.minLeadMinutes)}</p><p className="text-xs text-[var(--muted-foreground)]">最远 {policy.maxAdvanceDays} 天</p></td><td className="px-4 py-3"><StatusBadge status={policy.status} /></td><td className="px-4 py-3 text-right"><Button icon={<Edit3 className="h-4 w-4" />} onClick={() => onRevise(policy)} type="button" variant="secondary">新版本</Button></td></tr>)}</tbody></DataTable>} mobile={policies.map((policy) => <article className="grid gap-3 px-4 py-4" key={policy.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{policy.name}</h3><p className="text-xs text-[var(--muted-foreground)]">V{policy.version} · {policy.defaultWindows.map(windowLabel).join('、')}</p></div><StatusBadge status={policy.status} /></div><Button onClick={() => onRevise(policy)} type="button" variant="secondary">创建新版本</Button></article>)} /></AsyncState>
}

function OfferingSection({ loading, offerings, onCreate, onEdit }: { loading: boolean; offerings: BookingOffering[]; onCreate: () => void; onEdit: (offering: BookingOffering) => void }) {
  return <AsyncState empty={!offerings.length ? <EmptyState noun="教师预约课程" onCreate={onCreate} /> : undefined} loading={loading && !offerings.length} loadingLabel="正在加载教师预约课程..."><div className="border-b border-[var(--border)] px-4 py-4"><SectionHeader actions={<Button icon={<Plus className="h-4 w-4" />} onClick={onCreate} type="button">新增教师课程</Button>} description="逐一启用教师与一对一课程的预约关系；停用后历史预约仍保留。" title="教师可预约课程" /></div><ResponsiveDataRegion desktop={<DataTable><thead><tr className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3">教师</th><th className="px-4 py-3">课程</th><th className="px-4 py-3">地点</th><th className="px-4 py-3">开放时间</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{offerings.map((offering) => <tr className="border-b border-[var(--border)]" key={offering.id}><td className="px-4 py-3 font-semibold">{offering.teacher.name}</td><td className="px-4 py-3">{offering.course.name}</td><td className="px-4 py-3">{offering.location || '待确认'}</td><td className="px-4 py-3">{offering.availabilityMode === 'custom' ? '教师自定义' : '机构默认'}</td><td className="px-4 py-3"><StatusBadge status={offering.status} /></td><td className="px-4 py-3 text-right"><Button onClick={() => onEdit(offering)} type="button" variant="secondary">编辑</Button></td></tr>)}</tbody></DataTable>} mobile={offerings.map((offering) => <article className="grid gap-3 px-4 py-4" key={offering.id}><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{offering.teacher.name} · {offering.course.name}</h3><p className="text-xs text-[var(--muted-foreground)]">{offering.location || '地点待确认'} · {offering.availabilityMode === 'custom' ? '教师自定义时间' : '机构默认时间'}</p></div><StatusBadge status={offering.status} /></div><Button onClick={() => onEdit(offering)} type="button" variant="secondary">编辑预约课程</Button></article>)} /></AsyncState>
}

function AvailabilitySection({ availability, loading, offerings, onAddOverride, onCancelOverride, onEditWeekly, onOfferingChange, selectedOfferingId }: { availability: BookingAvailability; loading: boolean; offerings: BookingOffering[]; onAddOverride: () => void; onCancelOverride: (item: BookingAvailabilityOverride) => void; onEditWeekly: () => void; onOfferingChange: (id: string) => void; selectedOfferingId: string }) {
  const rules = availability.rules.filter((item) => !item.status || item.status === 'active')
  const overrides = availability.overrides.filter((item) => item.status === 'active')
  return <div><div className="grid gap-3 border-b border-[var(--border)] bg-[var(--brand-wash)] px-4 py-4 sm:grid-cols-[minmax(16rem,1fr)_auto_auto] sm:items-end"><label className="grid gap-1.5 text-xs font-medium">教师课程<Select onChange={(event) => onOfferingChange(event.target.value)} options={offerings.map((item) => ({ label: `${item.teacher.name} · ${item.course.name}`, value: item.id }))} value={selectedOfferingId} /></label><Button disabled={!selectedOfferingId} icon={<Clock3 className="h-4 w-4" />} onClick={onEditWeekly} type="button" variant="secondary">每周时间</Button><Button disabled={!selectedOfferingId} icon={<Plus className="h-4 w-4" />} onClick={onAddOverride} type="button">日期例外</Button></div><AsyncState empty={!selectedOfferingId ? <EmptyState noun="可维护的教师预约课程" /> : undefined} loading={loading && Boolean(selectedOfferingId)} loadingLabel="正在加载开放时间..."><div className="grid gap-px bg-[var(--border)] lg:grid-cols-2"><section className="grid content-start gap-4 bg-[var(--card)] p-4"><SectionHeader description={rules.length ? `${rules.length} 个自定义时段` : '当前继承机构默认开放时间'} title="每周开放" />{rules.length ? <div className="grid gap-2">{rules.map((rule) => <div className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm" key={rule.id || `${rule.weekday}-${rule.startMinute}`}><span className="font-medium">{weekdayLabel(rule.weekday)}</span><span className="tabular-nums text-[var(--muted-foreground)]">{minuteTime(rule.startMinute)}-{minuteTime(rule.endMinute)}</span></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">教师尚未设置自定义时间，系统会使用机构策略中的上午与下午开放时段。</p>}</section><section className="grid content-start gap-4 bg-[var(--card)] p-4"><SectionHeader description={`${overrides.length} 个生效中的日期例外`} title="日期例外" />{overrides.length ? <div className="grid gap-2">{overrides.map((item) => <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-3" key={item.id}><div><div className="flex items-center gap-2"><p className="font-medium">{item.type === 'available' ? '临时加开' : '临时不开放'}</p><Badge tone={item.type === 'available' ? 'green' : 'amber'}>{formatDateTime(item.startAt)}</Badge></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatTimeRange(item.startAt, item.endAt)} · {item.reason || '无说明'}</p></div><IconButton icon={<XCircle className="h-4 w-4" />} label="撤销日期例外" onClick={() => onCancelOverride(item)} type="button" variant="ghost" /></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">暂无临时停用或加开安排。</p>}</section></div></AsyncState></div>
}

function StatusBadge({ status }: { status: string }) { const copy = status === 'active' ? '已启用' : status === 'draft' ? '草稿' : '已停用'; return <Badge tone={status === 'active' ? 'green' : status === 'draft' ? 'amber' : 'neutral'}>{copy}</Badge> }
function windowLabel(window: { startMinute: number; endMinute: number }) { return `${minuteTime(window.startMinute)}-${minuteTime(window.endMinute)}` }
function minuteTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
function durationLabel(minutes: number) { if (minutes % 1440 === 0) return `${minutes / 1440} 天`; if (minutes % 60 === 0) return `${minutes / 60} 小时`; return `${minutes} 分钟` }
function weekdayLabel(value: number) { return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][value - 1] || `星期 ${value}` }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) }
function formatTimeRange(start: string, end: string) { const formatter = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); return `${formatter(start)}-${formatter(end)}` }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
