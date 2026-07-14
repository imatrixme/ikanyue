import { Eye, Gift, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { FilterSummary, ListEmptyState, PaginationControls } from './ListControls'
import { isRecord, pageItems, parseOptionalNumber, stringValue, usePersistedFilters } from './listState'
import { PointActionDialog } from './PointActionDialog'
import { StudentDetailDialog } from './StudentDetailDialog'

interface PointsWorkspaceProps {
  loading: boolean
  rewards: RewardItem[]
  selectedStudentId: string
  studentSummary: StudentPointSummary | null
  students: StudentPointsRow[]
  onAddPoints: (studentId: string, payload: { amount: number; reason?: string; remark?: string }) => Promise<boolean | void>
  onLoadStudent: (studentId: string) => Promise<StudentPointSummary | null>
  onRedeem: (studentId: string, itemId: string, remark?: string) => Promise<boolean | void>
  onReloadStudents: () => Promise<void>
}

interface LearnerFilters { keyword: string; maxBalance: string; minBalance: string; sort: LearnerSort }
type LearnerSort = 'name-asc' | 'balance-desc' | 'balance-asc'
type LearnerOverlay = { kind: 'grant' | 'redeem'; student: StudentPointsRow } | { kind: 'detail'; student: StudentPointsRow; summary: StudentPointSummary | null; loading: boolean }

const defaults: LearnerFilters = { keyword: '', maxBalance: '', minBalance: '', sort: 'name-asc' }
const pageSize = 8

export function PointsWorkspace(props: PointsWorkspaceProps) {
  const [filters, setFilters] = usePersistedFilters('kanyue.points.filters.v1', defaults, sanitizeFilters)
  const [page, setPage] = useState(1)
  const [overlay, setOverlay] = useState<LearnerOverlay | null>(null)
  const activeRewards = useMemo(() => props.rewards.filter((item) => item.status === 'active'), [props.rewards])
  const filtered = useMemo(() => filterStudents(props.students, filters), [filters, props.students])
  const paged = pageItems(filtered, page, pageSize)
  const activeCount = [filters.keyword, filters.minBalance, filters.maxBalance].filter(Boolean).length + (filters.sort === defaults.sort ? 0 : 1)

  function updateFilter<K extends keyof LearnerFilters>(key: K, value: LearnerFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(defaults)
    setPage(1)
  }

  async function openDetail(student: StudentPointsRow) {
    setOverlay({ kind: 'detail', student, summary: null, loading: true })
    const summary = await props.onLoadStudent(student.id)
    setOverlay((current) => current?.kind === 'detail' && current.student.id === student.id ? { ...current, summary, loading: false } : current)
  }

  async function retryDetail() {
    if (overlay?.kind !== 'detail') return
    setOverlay({ ...overlay, loading: true })
    const summary = await props.onLoadStudent(overlay.student.id)
    setOverlay((current) => current?.kind === 'detail' ? { ...current, summary, loading: false } : current)
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div><h2 className="text-lg font-semibold">学员积分</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">浏览积分状态，再从学员行发起操作。</p></div>
        <div className="flex items-center gap-2"><Badge tone="blue">{props.students.length} 人</Badge><Button aria-label="重新加载学员" className="h-9 w-9 px-0" disabled={props.loading} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void props.onReloadStudents()} type="button" variant="secondary" /></div>
      </div>
      <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--muted)]/35 px-4 py-4 md:grid-cols-[minmax(180px,1fr)_140px_140px_180px]">
        <Field label="搜索学员" htmlFor="learner-keyword"><Input id="learner-keyword" placeholder="姓名 / 昵称 / 手机号" value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} /></Field>
        <Field label="最低积分" htmlFor="learner-min"><Input id="learner-min" min="0" type="number" value={filters.minBalance} onChange={(event) => updateFilter('minBalance', event.target.value)} /></Field>
        <Field label="最高积分" htmlFor="learner-max"><Input id="learner-max" min="0" type="number" value={filters.maxBalance} onChange={(event) => updateFilter('maxBalance', event.target.value)} /></Field>
        <Field label="排序" htmlFor="learner-sort"><Select id="learner-sort" options={[{ value: 'name-asc', label: '姓名升序' }, { value: 'balance-desc', label: '积分从高到低' }, { value: 'balance-asc', label: '积分从低到高' }]} value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as LearnerSort)} /></Field>
      </div>
      <div className="px-4"><FilterSummary activeCount={activeCount} onReset={resetFilters} /></div>
      {props.loading && props.students.length === 0 ? <div className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]">正在加载学员积分...</div> : paged.items.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block"><LearnerTable activeRewards={activeRewards} selectedId={props.selectedStudentId} summary={props.studentSummary} students={paged.items} onAction={(kind, student) => kind === 'detail' ? void openDetail(student) : setOverlay({ kind, student })} /></div>
          <div className="grid divide-y divide-[var(--border)] md:hidden">{paged.items.map((student) => <LearnerCard activeRewards={activeRewards} key={student.id} student={student} onAction={(kind) => kind === 'detail' ? void openDetail(student) : setOverlay({ kind, student })} />)}</div>
        </>
      ) : <ListEmptyState filtered={activeCount > 0} noun="学员" onReset={resetFilters} />}
      <PaginationControls onPageChange={setPage} page={paged.page} totalItems={filtered.length} totalPages={paged.totalPages} />
      {overlay?.kind === 'grant' || overlay?.kind === 'redeem' ? <PointActionDialog loading={props.loading} mode={overlay.kind} onAddPoints={props.onAddPoints} onClose={() => setOverlay(null)} onRedeem={props.onRedeem} rewards={props.rewards} student={overlay.student} /> : null}
      {overlay?.kind === 'detail' ? <StudentDetailDialog loading={overlay.loading} onClose={() => setOverlay(null)} onRetry={() => void retryDetail()} rewards={props.rewards} student={overlay.student} summary={overlay.summary} /> : null}
    </Panel>
  )
}

function LearnerTable({ activeRewards, selectedId, students, summary, onAction }: { activeRewards: RewardItem[]; selectedId: string; students: StudentPointsRow[]; summary: StudentPointSummary | null; onAction: (kind: 'grant' | 'redeem' | 'detail', student: StudentPointsRow) => void }) {
  return <table className="w-full border-collapse text-sm"><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)]/65 text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3 font-medium">学员</th><th className="px-4 py-3 font-medium">当前积分</th><th className="px-4 py-3 font-medium">可兑换</th><th className="px-4 py-3 font-medium">最近记录</th><th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody>{students.map((student) => <tr className="border-b border-[var(--border)] last:border-0" key={student.id}><td className="px-4 py-3"><p className="font-semibold">{studentName(student)}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student.cellphone || '无手机号'}</p></td><td className="px-4 py-3 font-semibold tabular-nums text-[var(--point)]">{student.balance} 分</td><td className="px-4 py-3">{affordableCount(activeRewards, student.balance)} 件</td><td className="px-4 py-3 text-[var(--muted-foreground)]">{selectedId === student.id && summary?.events?.[0] ? eventSummary(summary.events[0]) : '-'}</td><td className="px-4 py-3"><RowActions student={student} onAction={onAction} /></td></tr>)}</tbody></table>
}

function LearnerCard({ activeRewards, student, onAction }: { activeRewards: RewardItem[]; student: StudentPointsRow; onAction: (kind: 'grant' | 'redeem' | 'detail') => void }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{studentName(student)}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student.cellphone || '无手机号'}</p></div><p className="text-xl font-semibold tabular-nums text-[var(--point)]">{student.balance} 分</p></div><p className="text-sm text-[var(--muted-foreground)]">当前可兑换 {affordableCount(activeRewards, student.balance)} 件实物</p><RowActions student={student} onAction={(kind) => onAction(kind)} mobile /></article>
}

function RowActions({ mobile = false, onAction, student }: { mobile?: boolean; onAction: (kind: 'grant' | 'redeem' | 'detail', student: StudentPointsRow) => void; student: StudentPointsRow }) {
  return <div className={mobile ? 'grid grid-cols-3 gap-2' : 'flex justify-end gap-2'}><Button aria-label={`为${studentName(student)}增加积分`} className={mobile ? 'px-2' : 'h-9'} icon={<Plus className="h-4 w-4" />} onClick={() => onAction('grant', student)} type="button" variant="secondary">加分</Button><Button aria-label={`为${studentName(student)}线下兑换`} className={mobile ? 'px-2' : 'h-9'} icon={<Gift className="h-4 w-4" />} onClick={() => onAction('redeem', student)} type="button" variant="secondary">兑换</Button><Button aria-label={`查看${studentName(student)}详情`} className={mobile ? 'px-2' : 'h-9'} icon={<Eye className="h-4 w-4" />} onClick={() => onAction('detail', student)} type="button" variant="ghost">详情</Button></div>
}

function filterStudents(students: StudentPointsRow[], filters: LearnerFilters) {
  const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN')
  const min = parseOptionalNumber(filters.minBalance)
  const max = parseOptionalNumber(filters.maxBalance)
  return students.filter((student) => (!keyword || [student.realName, student.nickName, student.cellphone].some((value) => value?.toLocaleLowerCase('zh-CN').includes(keyword))) && (min === null || student.balance >= min) && (max === null || student.balance <= max)).sort((a, b) => filters.sort === 'balance-desc' ? b.balance - a.balance : filters.sort === 'balance-asc' ? a.balance - b.balance : studentName(a).localeCompare(studentName(b), 'zh-CN'))
}

function sanitizeFilters(value: unknown, fallback: LearnerFilters): LearnerFilters {
  if (!isRecord(value)) return fallback
  const sort = stringValue(value.sort) as LearnerSort
  return { keyword: stringValue(value.keyword), minBalance: stringValue(value.minBalance), maxBalance: stringValue(value.maxBalance), sort: ['name-asc', 'balance-desc', 'balance-asc'].includes(sort) ? sort : fallback.sort }
}

function affordableCount(rewards: RewardItem[], balance: number) { return rewards.filter((item) => item.pointsPrice <= balance).length }
function studentName(student: StudentPointsRow) { return student.realName || student.nickName || student.cellphone || '未命名学员' }
function eventSummary(event: StudentPointSummary['events'][number]) { return `${event.delta > 0 ? '+' : ''}${event.delta} · ${event.rewardSnapshot?.name || event.reason || event.remark || '-'}` }
