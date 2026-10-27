import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { Venue, VenueInput } from '../../app/venueApi'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton, Switch } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { useNotify } from '../ui/notifyContext'

const emptyVenue: VenueInput = { address: '', bookable: true, intro: '', name: '', openingHours: '', phone: '', sortOrder: 0, status: 'active' }

// Venues shown in the mini program; students switch between them, and non-bookable venues offer a phone hand-off.
export function VenuesWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const notify = useNotify()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ venue: Venue | null } | null>(null)
  const [statusTarget, setStatusTarget] = useState<Venue | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setVenues((await api.listVenues(token)).items) }
    catch (loadError) { setError(message(loadError, '加载场馆失败')) }
    finally { setLoading(false) }
  }, [api, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function save(id: string | null, data: VenueInput) {
    setLoading(true); setError('')
    try {
      if (id) await api.updateVenue(token, id, data); else await api.createVenue(token, data)
      setEditor(null); notify(id ? '场馆已保存' : '场馆已新增'); await load()
      return true
    } catch (saveError) { setError(message(saveError, '保存场馆失败')); setLoading(false); return false }
  }

  async function toggleStatus(venue: Venue) {
    setStatusTarget(null)
    const status = venue.status === 'active' ? 'inactive' : 'active'
    setLoading(true); setError('')
    try { await api.updateVenue(token, venue.id, { status }); notify(status === 'active' ? '场馆已恢复' : '场馆已停用'); await load() }
    catch (statusError) { setError(message(statusError, '更新场馆状态失败')); setLoading(false) }
  }

  function requestToggle(venue: Venue) {
    if (venue.status === 'active') setStatusTarget(venue); else void toggleStatus(venue)
  }

  const actions = (venue: Venue) => <div className="flex justify-end gap-2"><Button aria-label={`编辑${venue.name}`} icon={<Pencil className="h-4 w-4" />} onClick={() => setEditor({ venue })} type="button" variant="secondary">编辑</Button><Button aria-label={`${venue.status === 'active' ? '停用' : '恢复'}${venue.name}`} onClick={() => requestToggle(venue)} type="button" variant="ghost">{venue.status === 'active' ? '停用' : '恢复'}</Button></div>

  return (
    <WorkspacePanel>
      <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载场馆" onClick={() => void load()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新增场馆" onClick={() => setEditor({ venue: null })} type="button" variant="primary" /></>} title="场馆" />
      <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">小程序按排序展示启用的场馆，学员可以在场馆页切换；不可在线约课的场馆只提供电话咨询。</p>
      <AsyncState empty={venues.length === 0 ? <EmptyState noun="场馆" onCreate={() => setEditor({ venue: null })} /> : undefined} error={error} loading={loading && venues.length === 0} loadingLabel="正在加载场馆..." onRetry={() => void load()}>
        <ResponsiveDataRegion
          desktop={<DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3 font-medium">场馆</th><th className="px-4 py-3 font-medium">营业时间</th><th className="px-4 py-3 font-medium">电话</th><th className="px-4 py-3 font-medium">在线约课</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">排序</th><th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody>{venues.map((venue) => <tr className="border-b border-[var(--border)] last:border-0" key={venue.id}><td className="px-4 py-3"><p className="font-semibold">{venue.name}</p><p className="mt-1 max-w-sm truncate text-xs text-[var(--muted-foreground)]">{venue.address || '未填写地址'}</p></td><td className="px-4 py-3">{venue.openingHours || '—'}</td><td className="px-4 py-3 tabular-nums">{venue.phone || '—'}</td><td className="px-4 py-3">{venue.bookable ? '可约课' : '仅电话咨询'}</td><td className="px-4 py-3"><StatusBadge venue={venue} /></td><td className="px-4 py-3 tabular-nums">{venue.sortOrder}</td><td className="px-4 py-3">{actions(venue)}</td></tr>)}</tbody></DataTable>}
          mobile={venues.map((venue) => <article className="grid gap-2 px-4 py-4" key={venue.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{venue.name}</h3><StatusBadge venue={venue} /></div><p className="text-xs text-[var(--muted-foreground)]">{venue.address || '未填写地址'} · {venue.bookable ? '可约课' : '仅电话咨询'}</p>{actions(venue)}</article>)}
        />
      </AsyncState>
      {editor ? <DrawerShell description="保存后小程序下次打开即可看到" onRequestClose={() => setEditor(null)} title={editor.venue ? `编辑${editor.venue.name}` : '新增场馆'}><VenueEditor key={editor.venue?.id || 'new-venue'} loading={loading} onCancel={() => setEditor(null)} onSave={save} venue={editor.venue} /></DrawerShell> : null}
      {statusTarget ? <ConfirmDialog confirmLabel="确认停用" description={`停用后小程序不再展示「${statusTarget.name}」，已选择它的学员会回到第一个场馆。之后可以随时恢复。`} destructive onCancel={() => setStatusTarget(null)} onConfirm={() => void toggleStatus(statusTarget)} title="停用场馆" /> : null}
    </WorkspacePanel>
  )
}

function StatusBadge({ venue }: { venue: Venue }) {
  return <Badge tone={venue.status === 'active' ? 'green' : 'neutral'}>{venue.status === 'active' ? '启用' : '已停用'}</Badge>
}

function VenueEditor({ loading, onCancel, onSave, venue }: { loading: boolean; onCancel: () => void; onSave: (id: string | null, data: VenueInput) => Promise<boolean>; venue: Venue | null }) {
  const [form, setForm] = useState<VenueInput>(() => (venue ? { ...venue } : emptyVenue))
  const update = <K extends keyof VenueInput>(key: K, value: VenueInput[K]) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <form className="flex min-h-full flex-col" onSubmit={(event) => { event.preventDefault(); void onSave(venue?.id || null, { ...form, sortOrder: Number(form.sortOrder) || 0 }) }}>
      <div className="grid gap-4 p-5">
        <Field label="场馆名称" htmlFor="venue-name"><Input data-autofocus id="venue-name" maxLength={40} value={form.name} onChange={(event) => update('name', event.target.value)} /></Field>
        <Field label="简介" htmlFor="venue-intro" hint="显示在场馆名称下方，例如“声乐课程与预约”。"><Input id="venue-intro" maxLength={120} value={form.intro} onChange={(event) => update('intro', event.target.value)} /></Field>
        <Field label="地址" htmlFor="venue-address"><Input id="venue-address" maxLength={120} value={form.address} onChange={(event) => update('address', event.target.value)} /></Field>
        <Field label="营业时间" htmlFor="venue-hours" hint="例如“周二至周日 10:00-21:00”，不填则不显示。"><Input id="venue-hours" maxLength={80} value={form.openingHours} onChange={(event) => update('openingHours', event.target.value)} /></Field>
        <Field label="咨询电话" htmlFor="venue-phone"><Input id="venue-phone" inputMode="tel" maxLength={20} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></Field>
        <Switch checked={form.bookable} description="关闭后，学员切换到此场馆时只看到电话咨询。" label="开放在线约课" onChange={(event) => update('bookable', event.target.checked)} />
        <Field label="排序" htmlFor="venue-sort" hint="数字越小越靠前；排第一的启用场馆是学员的默认场馆。"><Input id="venue-sort" step="1" type="number" value={String(form.sortOrder)} onChange={(event) => update('sortOrder', Number(event.target.value))} /></Field>
      </div>
      <div className="sticky bottom-0 mt-auto flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4"><Button onClick={onCancel} type="button" variant="secondary">取消</Button><Button disabled={loading || !form.name.trim()}>{venue ? '保存场馆' : '创建场馆'}</Button></div>
    </form>
  )
}

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
