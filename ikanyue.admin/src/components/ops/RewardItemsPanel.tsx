import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { viewBusinessIcons } from '../../app/businessIcons'
import type { RewardItem, RewardItemInput, UploadProgressHandler } from '../../app/types'
import { FilterToolbar, PageHeader, SummaryBand, SummaryMetric, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { FilterSummary, ListEmptyState, PaginationControls } from './ListControls'
import { isRecord, pageItems, parseOptionalNumber, stringValue, usePersistedFilters } from './listState'
import { RewardEditor } from './RewardEditor'
import { RewardMedia } from './RewardMedia'

interface RewardItemsPanelProps { loading: boolean; rewards: RewardItem[]; onReloadRewards: () => Promise<void>; onSave: (id: string | null, payload: RewardItemInput) => Promise<boolean>; onUploadImage?: (id: string, file: File, onProgress?: UploadProgressHandler) => Promise<RewardItem | null> }
interface RewardFilters { keyword: string; maxPoints: string; minPoints: string; sort: RewardSort; status: 'all' | 'active' | 'inactive' }
type RewardSort = 'sort-asc' | 'price-asc' | 'price-desc' | 'name-asc'
const defaults: RewardFilters = { keyword: '', maxPoints: '', minPoints: '', sort: 'sort-asc', status: 'all' }
const pageSize = 8

export function RewardItemsPanel({ loading, rewards, onReloadRewards, onSave, onUploadImage }: RewardItemsPanelProps) {
  const [filters, setFilters] = usePersistedFilters('kanyue.rewards.filters.v1', defaults, sanitizeFilters)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ reward: RewardItem | null } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [discardPrompt, setDiscardPrompt] = useState(false)
  const filtered = useMemo(() => filterRewards(rewards, filters), [filters, rewards])
  const paged = pageItems(filtered, page, pageSize)
  const activeCount = [filters.keyword, filters.minPoints, filters.maxPoints].filter(Boolean).length + (filters.status === 'all' ? 0 : 1) + (filters.sort === defaults.sort ? 0 : 1)

  function updateFilter<K extends keyof RewardFilters>(key: K, value: RewardFilters[K]) { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  function resetFilters() { setFilters(defaults); setPage(1) }
  function forceClose() { setEditor(null); setDirty(false); setDiscardPrompt(false) }
  function requestClose() { if (dirty) setDiscardPrompt(true); else forceClose() }

  return (
    <WorkspacePanel>
      <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载实物" onClick={() => void onReloadRewards()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新增实物" onClick={() => setEditor({ reward: null })} type="button" variant="primary" /></>} badge={<Badge tone="blue">{rewards.filter((item) => item.status === 'active').length} 个上架</Badge>} description="浏览、比较并维护线下可兑换实物，编辑流程在右侧抽屉完成。" eyebrow="实物目录与价格" title="实物管理" icon={viewBusinessIcons.rewards} />
      <SummaryBand><SummaryMetric label="实物总数" value={`${rewards.length} 件`} /><SummaryMetric label="当前上架" value={`${rewards.filter((item) => item.status === 'active').length} 件`} /><SummaryMetric label="积分价格范围" value={rewardPriceRange(rewards)} /></SummaryBand>
      <FilterToolbar className="md:grid-cols-[minmax(180px,1fr)_130px_120px_120px_170px]">
        <Field label="搜索实物" htmlFor="reward-keyword"><Input id="reward-keyword" placeholder="名称 / 说明" value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} /></Field>
        <Field label="状态" htmlFor="reward-filter-status"><Select allowEmpty id="reward-filter-status" options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '上架' }, { value: 'inactive', label: '下线' }]} value={filters.status} onChange={(event) => updateFilter('status', event.target.value as RewardFilters['status'])} /></Field>
        <Field label="最低积分" htmlFor="reward-min"><Input id="reward-min" min="0" type="number" value={filters.minPoints} onChange={(event) => updateFilter('minPoints', event.target.value)} /></Field>
        <Field label="最高积分" htmlFor="reward-max"><Input id="reward-max" min="0" type="number" value={filters.maxPoints} onChange={(event) => updateFilter('maxPoints', event.target.value)} /></Field>
        <Field label="排序" htmlFor="reward-filter-sort"><Select id="reward-filter-sort" options={[{ value: 'sort-asc', label: '后台排序' }, { value: 'price-asc', label: '积分从低到高' }, { value: 'price-desc', label: '积分从高到低' }, { value: 'name-asc', label: '名称升序' }]} value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as RewardSort)} /></Field>
      </FilterToolbar>
      <div className="px-4"><FilterSummary activeCount={activeCount} onReset={resetFilters} /></div>
      <AsyncState empty={paged.items.length === 0 ? <ListEmptyState filtered={activeCount > 0} noun="实物" onCreate={() => setEditor({ reward: null })} onReset={resetFilters} /> : undefined} loading={loading && rewards.length === 0} loadingLabel="正在加载实物..."><ResponsiveDataRegion desktop={<RewardTable onEdit={(reward) => setEditor({ reward })} rewards={paged.items} />} mobile={paged.items.map((reward) => <RewardCard key={reward.id} onEdit={() => setEditor({ reward })} reward={reward} />)} /></AsyncState>
      <PaginationControls onPageChange={setPage} page={paged.page} totalItems={filtered.length} totalPages={paged.totalPages} />
      {editor ? <DrawerShell description={editor.reward ? '修改后保存会刷新实物列表' : '先创建基本信息，之后可以上传图片'} onRequestClose={discardPrompt ? () => setDiscardPrompt(false) : requestClose} size="wide" title={editor.reward ? `编辑${editor.reward.name}` : '新增实物'}>{discardPrompt ? <DiscardPrompt onContinue={() => setDiscardPrompt(false)} onDiscard={forceClose} /> : null}<RewardEditor key={editor.reward?.id || 'new-reward'} loading={loading} onCancel={requestClose} onDirtyChange={setDirty} onSave={onSave} onSaved={forceClose} onUploadImage={onUploadImage} reward={editor.reward} /></DrawerShell> : null}
    </WorkspacePanel>
  )
}

function RewardTable({ onEdit, rewards }: { onEdit: (reward: RewardItem) => void; rewards: RewardItem[] }) { return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3 font-medium">实物</th><th className="px-4 py-3 font-medium">积分</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">排序</th><th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody>{rewards.map((reward) => <tr className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand-wash)] last:border-0" key={reward.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><RewardMedia className="w-16" name={reward.name} src={reward.image} /><div className="min-w-0"><p className="font-semibold">{reward.name}</p><p className="mt-1 max-w-sm truncate text-xs text-[var(--muted-foreground)]">{reward.description || '暂无说明'}</p></div></div></td><td className="px-4 py-3 font-semibold tabular-nums text-[var(--point)]">{reward.pointsPrice} 分</td><td className="px-4 py-3"><Badge tone={reward.status === 'active' ? 'green' : 'neutral'}>{reward.status === 'active' ? '上架' : '下线'}</Badge></td><td className="px-4 py-3 tabular-nums">{reward.sortOrder || 0}</td><td className="px-4 py-3 text-right"><Button aria-label={`编辑${reward.name}`} icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(reward)} type="button" variant="secondary">编辑</Button></td></tr>)}</tbody></DataTable> }
function RewardCard({ onEdit, reward }: { onEdit: () => void; reward: RewardItem }) { return <article className="grid gap-3 px-4 py-4"><div className="flex items-center gap-3"><RewardMedia className="w-20" name={reward.name} src={reward.image} /><div className="min-w-0"><h3 className="font-semibold">{reward.name}</h3><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{reward.description || '暂无说明'}</p></div></div><div className="flex items-center justify-between"><span className="text-xs text-[var(--muted-foreground)]">积分价格</span><span className="font-semibold text-[var(--point)]">{reward.pointsPrice} 分</span></div><div className="flex items-center justify-between"><span className="text-xs text-[var(--muted-foreground)]">状态 · 排序 {reward.sortOrder || 0}</span><Badge tone={reward.status === 'active' ? 'green' : 'neutral'}>{reward.status === 'active' ? '上架' : '下线'}</Badge></div><Button aria-label={`编辑${reward.name}`} icon={<Pencil className="h-4 w-4" />} onClick={onEdit} type="button" variant="secondary">编辑</Button></article> }

function DiscardPrompt({ onContinue, onDiscard }: { onContinue: () => void; onDiscard: () => void }) { const continueRef = useRef<HTMLButtonElement>(null); useEffect(() => continueRef.current?.focus(), []); return <div className="border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-4" role="alert"><p className="font-semibold text-[var(--destructive)]">放弃未保存修改？</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">当前表单内容尚未保存，关闭后无法恢复。</p><div className="mt-3 flex gap-2"><Button data-autofocus ref={continueRef} onClick={onContinue} type="button" variant="secondary">继续编辑</Button><Button onClick={onDiscard} type="button" variant="danger">放弃修改</Button></div></div> }

function filterRewards(rewards: RewardItem[], filters: RewardFilters) { const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN'); const min = parseOptionalNumber(filters.minPoints); const max = parseOptionalNumber(filters.maxPoints); return rewards.filter((reward) => (!keyword || [reward.name, reward.description].some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))) && (filters.status === 'all' || reward.status === filters.status) && (min === null || reward.pointsPrice >= min) && (max === null || reward.pointsPrice <= max)).sort((a, b) => filters.sort === 'price-asc' ? a.pointsPrice - b.pointsPrice : filters.sort === 'price-desc' ? b.pointsPrice - a.pointsPrice : filters.sort === 'name-asc' ? a.name.localeCompare(b.name, 'zh-CN') : Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) }
function rewardPriceRange(rewards: RewardItem[]) { if (rewards.length === 0) return '-'; const prices = rewards.map((reward) => reward.pointsPrice); return `${Math.min(...prices)}-${Math.max(...prices)} 分` }
function sanitizeFilters(value: unknown, fallback: RewardFilters): RewardFilters { if (!isRecord(value)) return fallback; const status = stringValue(value.status) as RewardFilters['status']; const sort = stringValue(value.sort) as RewardSort; return { keyword: stringValue(value.keyword), minPoints: stringValue(value.minPoints), maxPoints: stringValue(value.maxPoints), status: ['all', 'active', 'inactive'].includes(status) ? status : fallback.status, sort: ['sort-asc', 'price-asc', 'price-desc', 'name-asc'].includes(sort) ? sort : fallback.sort } }
