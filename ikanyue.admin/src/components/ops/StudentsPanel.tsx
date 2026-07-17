import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { StudentInput, StudentRecord } from '../../app/types'
import { FilterToolbar, PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, ResponsiveDataRegion } from '../ui/DataDisplay'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { FilterSummary, ListEmptyState, PaginationControls } from './ListControls'
import { isRecord, pageItems, stringValue, usePersistedFilters } from './listState'
import { StudentEditorDialog } from './StudentEditorDialog'

interface StudentsPanelProps {
  errorMessage?: string
  loading: boolean
  onReload: () => Promise<void>
  onSave: (id: string | null, payload: StudentInput) => Promise<boolean>
  students: StudentRecord[]
}

interface StudentFilters { keyword: string; sort: StudentSort; status: 'all' | 'active' | 'inactive' }
type StudentSort = 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc'

const defaults: StudentFilters = { keyword: '', sort: 'created-desc', status: 'all' }
const pageSize = 8

export function StudentsPanel({ errorMessage, loading, onReload, onSave, students }: StudentsPanelProps) {
  const [filters, setFilters] = usePersistedFilters('kanyue.students.filters.v1', defaults, sanitizeFilters)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<StudentRecord | null | undefined>(undefined)
  const filtered = useMemo(() => filterStudents(students, filters), [filters, students])
  const paged = pageItems(filtered, page, pageSize)
  const activeCount = [filters.keyword].filter(Boolean).length + (filters.status === 'all' ? 0 : 1) + (filters.sort === defaults.sort ? 0 : 1)

  function updateFilter<K extends keyof StudentFilters>(key: K, value: StudentFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(defaults)
    setPage(1)
  }

  return (
    <WorkspacePanel>
      <PageHeader actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="重新加载学员管理列表" onClick={() => void onReload()} type="button" /><IconButton icon={<Plus className="h-4 w-4" />} label="新增学员" onClick={() => setEditor(null)} type="button" variant="primary" /></>} badge={<Badge tone="blue">{students.filter((student) => !student.blocked).length} 人启用</Badge>} description="维护积分系统使用的学员基本信息。" eyebrow="账号与资料" title="学员管理" />
      <FilterToolbar className="md:grid-cols-[minmax(220px,1fr)_160px_180px]">
        <Field label="搜索学员" htmlFor="student-directory-keyword"><Input id="student-directory-keyword" placeholder="姓名 / 昵称 / 手机号" value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} /></Field>
        <Field label="状态" htmlFor="student-directory-status"><Select allowEmpty id="student-directory-status" options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} value={filters.status} onChange={(event) => updateFilter('status', event.target.value as StudentFilters['status'])} /></Field>
        <Field label="排序" htmlFor="student-directory-sort"><Select id="student-directory-sort" options={[{ value: 'created-desc', label: '最近创建' }, { value: 'created-asc', label: '最早创建' }, { value: 'name-asc', label: '姓名升序' }, { value: 'name-desc', label: '姓名降序' }]} value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as StudentSort)} /></Field>
      </FilterToolbar>
      <div className="px-4"><FilterSummary activeCount={activeCount} onReset={resetFilters} /></div>
      <AsyncState empty={paged.items.length === 0 ? <ListEmptyState filtered={activeCount > 0} noun="学员" onCreate={() => setEditor(null)} onReset={resetFilters} /> : undefined} error={students.length === 0 ? errorMessage : undefined} errorTitle="学员列表加载失败" loading={loading && students.length === 0} loadingLabel="正在加载学员..." onRetry={() => void onReload()}><ResponsiveDataRegion desktop={<StudentTable onEdit={setEditor} students={paged.items} />} mobile={paged.items.map((student) => <StudentCard key={student.id} onEdit={() => setEditor(student)} student={student} />)} /></AsyncState>
      <PaginationControls onPageChange={setPage} page={paged.page} totalItems={filtered.length} totalPages={paged.totalPages} />
      {editor !== undefined ? <StudentEditorDialog loading={loading} onClose={() => setEditor(undefined)} onSave={onSave} student={editor} /> : null}
    </WorkspacePanel>
  )
}

function StudentTable({ onEdit, students }: { onEdit: (student: StudentRecord) => void; students: StudentRecord[] }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><th className="px-4 py-3 font-medium">学员</th><th className="px-4 py-3 font-medium">手机号</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">最近登录</th><th className="px-4 py-3 font-medium">创建时间</th><th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody>{students.map((student) => <tr className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand-wash)] last:border-0" key={student.id}><td className="px-4 py-3"><p className="font-semibold">{studentName(student)}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student.nickName || '无昵称'}</p></td><td className="px-4 py-3 tabular-nums">{student.cellphone}</td><td className="px-4 py-3"><StatusBadge blocked={student.blocked} /></td><td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDate(student.lastLoginAt)}</td><td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDate(student.created)}</td><td className="px-4 py-3 text-right"><Button aria-label={`编辑${studentName(student)}`} icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(student)} type="button" variant="secondary">编辑</Button></td></tr>)}</tbody></DataTable>
}

function StudentCard({ onEdit, student }: { onEdit: () => void; student: StudentRecord }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{studentName(student)}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{student.nickName || '无昵称'} · {student.cellphone}</p></div><StatusBadge blocked={student.blocked} /></div><div className="grid grid-cols-2 gap-3 text-xs text-[var(--muted-foreground)]"><span>最近登录<br />{formatDate(student.lastLoginAt)}</span><span>创建时间<br />{formatDate(student.created)}</span></div><Button aria-label={`编辑${studentName(student)}`} icon={<Pencil className="h-4 w-4" />} onClick={onEdit} type="button" variant="secondary">编辑</Button></article>
}

function StatusBadge({ blocked }: { blocked: boolean }) { return <Badge tone={blocked ? 'neutral' : 'green'}>{blocked ? '停用' : '启用'}</Badge> }
function studentName(student: StudentRecord) { return student.realName || student.nickName || student.cellphone || '未命名学员' }
function formatDate(value: string) { if (!value) return '从未登录'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }) }
function filterStudents(students: StudentRecord[], filters: StudentFilters) { const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN'); return students.filter((student) => (!keyword || [student.realName, student.nickName, student.cellphone].some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))) && (filters.status === 'all' || student.blocked === (filters.status === 'inactive'))).sort((a, b) => filters.sort === 'name-asc' ? studentName(a).localeCompare(studentName(b), 'zh-CN') : filters.sort === 'name-desc' ? studentName(b).localeCompare(studentName(a), 'zh-CN') : filters.sort === 'created-asc' ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created)) }
function sanitizeFilters(value: unknown, fallback: StudentFilters): StudentFilters { if (!isRecord(value)) return fallback; const status = stringValue(value.status) as StudentFilters['status']; const sort = stringValue(value.sort) as StudentSort; return { keyword: stringValue(value.keyword), status: ['all', 'active', 'inactive'].includes(status) ? status : fallback.status, sort: ['created-desc', 'created-asc', 'name-asc', 'name-desc'].includes(sort) ? sort : fallback.sort } }
