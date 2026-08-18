import { Eye, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OpsApi } from '../../app/api'
import { resourceBusinessIcons } from '../../app/businessIcons'
import type {
  CourseRecord,
  CourseResourceInput,
  CourseResourceKey,
  CourseWritableResource,
} from '../../app/courseTypes'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/Controls'
import { AsyncState, DataTable, EmptyState, ResponsiveDataRegion } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { DrawerShell } from '../ui/DrawerShell'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

export interface ResourceColumn {
  key: string
  label: string
  render?: (record: CourseRecord) => React.ReactNode
}

export interface ResourceField {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'checkbox'
  options?: Array<{ label: string; value: string }>
  placeholder?: string
}

interface CourseResourceWorkspaceProps {
  api: OpsApi
  token: string
  resource: CourseResourceKey
  writableResource?: CourseWritableResource
  title: string
  eyebrow: string
  description: string
  noun: string
  columns: ResourceColumn[]
  fields?: ResourceField[]
  statusOptions?: Array<{ label: string; value: string }>
  defaultValues?: CourseResourceInput
  query?: Record<string, string>
  onChanged?: () => void
}

const EMPTY_QUERY: Record<string, string> = {}

export function CourseResourceWorkspace(props: CourseResourceWorkspaceProps) {
  const { api, token, resource, writableResource, title, eyebrow, description, noun, columns, fields = [], statusOptions = [], defaultValues = {}, query = EMPTY_QUERY, onChanged } = props
  const [records, setRecords] = useState<CourseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CourseRecord | null>(null)
  const [editor, setEditor] = useState<CourseRecord | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<{ record: CourseRecord; status: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const page = await api.listCourseResource(token, resource, { page: 1, perPage: 100, ...query })
      setRecords(page.items)
    } catch (loadError) {
      setError(message(loadError, `加载${noun}失败`))
    } finally {
      setLoading(false)
    }
  }, [api, noun, query, resource, token])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function save(resourceToWrite: CourseWritableResource, values: CourseResourceInput) {
    setLoading(true)
    try {
      if (editor?.id) await api.updateCourseResource(token, resourceToWrite, editor.id, values)
      else await api.createCourseResource(token, resourceToWrite, values)
      setEditor(undefined)
      await load()
      onChanged?.()
    } catch (saveError) {
      setError(message(saveError, `保存${noun}失败`))
      setLoading(false)
    }
  }

  async function changeStatus(resourceToWrite: CourseWritableResource, target: { record: CourseRecord; status: string }) {
    setLoading(true)
    try {
      await api.setCourseResourceStatus(token, resourceToWrite, target.record.id, target.status, 'admin_status_change')
      setStatusTarget(null)
      await load()
      onChanged?.()
    } catch (statusError) {
      setError(message(statusError, `更新${noun}状态失败`))
      setLoading(false)
    }
  }

  const activeCount = useMemo(() => records.filter((record) => record.status === 'active' || record.status === 'scheduled').length, [records])

  return (
    <WorkspacePanel>
      <PageHeader
        actions={<><IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label={`重新加载${noun}`} onClick={() => void load()} type="button" />{writableResource ? <IconButton icon={<Plus className="h-4 w-4" />} label={`新增${noun}`} onClick={() => setEditor(null)} type="button" variant="primary" /> : null}</>}
        badge={<Badge tone="green">{records.length} 条 · {activeCount} 启用</Badge>}
        description={description}
        eyebrow={eyebrow}
        icon={resourceBusinessIcons[resource]}
        title={title}
      />
      <AsyncState empty={records.length === 0 ? <EmptyState noun={noun} onCreate={writableResource ? () => setEditor(null) : undefined} /> : undefined} error={error} loading={loading && records.length === 0} loadingLabel={`正在加载${noun}...`} onRetry={() => void load()}>
        <ResponsiveDataRegion desktop={<ResourceTable columns={columns} onEdit={writableResource ? setEditor : undefined} onSelect={setSelected} onStatus={statusOptions.length ? setStatusTarget : undefined} records={records} statusOptions={statusOptions} />} mobile={records.map((record) => <ResourceCard columns={columns} key={record.id} onEdit={writableResource ? () => setEditor(record) : undefined} onSelect={() => setSelected(record)} record={record} />)} />
      </AsyncState>
      {selected ? <ResourceDrawer columns={columns} onClose={() => setSelected(null)} record={selected} title={noun} /> : null}
      {editor !== undefined && writableResource ? <ResourceEditor defaultValues={defaultValues} fields={fields} loading={loading} noun={noun} onClose={() => setEditor(undefined)} onSave={(values) => save(writableResource, values)} record={editor} /> : null}
      {statusTarget && writableResource ? <ConfirmDialog confirmLabel="确认变更" description={<>将“{displayName(statusTarget.record)}”状态变更为 <strong>{statusTarget.status}</strong>。该操作会写入审计记录。</>} onCancel={() => setStatusTarget(null)} onConfirm={() => void changeStatus(writableResource, statusTarget)} title={`变更${noun}状态`} /> : null}
    </WorkspacePanel>
  )
}

function ResourceTable({ columns, onEdit, onSelect, onStatus, records, statusOptions }: { columns: ResourceColumn[]; onEdit?: (record: CourseRecord) => void; onSelect: (record: CourseRecord) => void; onStatus?: (target: { record: CourseRecord; status: string }) => void; records: CourseRecord[]; statusOptions: Array<{ label: string; value: string }> }) {
  return <DataTable><thead><tr className="border-y border-[var(--border)] bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">{columns.map((column) => <th className="px-4 py-3 font-medium" key={column.key}>{column.label}</th>)}<th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody>{records.map((record) => <tr className="border-b border-[var(--border)] hover:bg-[var(--brand-wash)]" key={record.id}>{columns.map((column) => <td className="px-4 py-3" key={column.key}>{column.render ? column.render(record) : formatValue(record[column.key])}</td>)}<td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton icon={<Eye className="h-4 w-4" />} label="查看详情" onClick={() => onSelect(record)} type="button" variant="ghost" />{onEdit ? <IconButton icon={<Pencil className="h-4 w-4" />} label="编辑" onClick={() => onEdit(record)} type="button" variant="secondary" /> : null}{onStatus ? <select aria-label={`变更${displayName(record)}状态`} className="h-9 rounded-md border border-[var(--input)] bg-[var(--card)] px-2 text-xs" onChange={(event) => { if (event.target.value) onStatus({ record, status: event.target.value }); event.target.value = '' }} defaultValue=""><option value="" disabled>状态</option>{statusOptions.filter((option) => option.value !== record.status).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}</div></td></tr>)}</tbody></DataTable>
}

function ResourceCard({ columns, onEdit, onSelect, record }: { columns: ResourceColumn[]; onEdit?: () => void; onSelect: () => void; record: CourseRecord }) {
  return <article className="grid gap-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{displayName(record)}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(record.code || record.status || record.id)}</p></div>{record.status ? <Badge tone={record.status === 'active' || record.status === 'scheduled' ? 'green' : 'neutral'}>{record.status}</Badge> : null}</div><dl className="grid grid-cols-2 gap-3 text-xs">{columns.slice(0, 4).map((column) => <div key={column.key}><dt className="text-[var(--muted-foreground)]">{column.label}</dt><dd className="mt-1 font-medium">{column.render ? column.render(record) : formatValue(record[column.key])}</dd></div>)}</dl><div className="flex gap-2"><Button icon={<Eye className="h-4 w-4" />} onClick={onSelect} type="button" variant="secondary">详情</Button>{onEdit ? <Button icon={<Pencil className="h-4 w-4" />} onClick={onEdit} type="button" variant="secondary">编辑</Button> : null}</div></article>
}

function ResourceDrawer({ columns, onClose, record, title }: { columns: ResourceColumn[]; onClose: () => void; record: CourseRecord; title: string }) {
  return <DrawerShell description={String(record.code || record.id)} onRequestClose={onClose} title={`${displayName(record)} · ${title}`}><dl className="grid gap-px bg-[var(--border)] sm:grid-cols-2">{columns.map((column) => <div className="bg-[var(--card)] p-4" key={column.key}><dt className="text-xs text-[var(--muted-foreground)]">{column.label}</dt><dd className="mt-1 text-sm font-semibold">{column.render ? column.render(record) : formatValue(record[column.key])}</dd></div>)}</dl></DrawerShell>
}

function ResourceEditor({ defaultValues, fields, loading, noun, onClose, onSave, record }: { defaultValues: CourseResourceInput; fields: ResourceField[]; loading: boolean; noun: string; onClose: () => void; onSave: (values: CourseResourceInput) => Promise<void>; record: CourseRecord | null }) {
  const editableRecord = record ? Object.fromEntries(fields.map((field) => [field.key, record[field.key]])) : {}
  const existingState = record ? { status: record.status, version: record.version } : {}
  const initial = { ...defaultValues, ...editableRecord, ...existingState }
  const [values, setValues] = useState<CourseResourceInput>(initial)
  return <DialogShell description="字段会通过 Hono 校验并写入操作审计。" onRequestClose={onClose} title={record ? `编辑${noun}` : `新增${noun}`}><form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSave(values) }}>{fields.map((field) => <Field htmlFor={`resource-${field.key}`} key={field.key} label={field.label}><ResourceInput field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /></Field>)}<div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4 sm:col-span-2"><Button onClick={onClose} type="button" variant="secondary">取消</Button><Button disabled={loading} type="submit">{loading ? '保存中...' : '保存'}</Button></div></form></DialogShell>
}

function ResourceInput({ field, onChange, value }: { field: ResourceField; onChange: (value: string | number | boolean) => void; value: CourseResourceInput[string] }) {
  if (field.type === 'select') return <Select id={`resource-${field.key}`} options={field.options || []} required={field.required} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
  if (field.type === 'checkbox') return <input checked={Boolean(value)} className="h-5 w-5 accent-[var(--brand)]" id={`resource-${field.key}`} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
  return <Input id={`resource-${field.key}`} placeholder={field.placeholder} required={field.required} type={field.type || 'text'} value={String(value ?? '')} onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)} />
}

function displayName(record: CourseRecord) { return String(record.name || record.title || record.operationNo || record.studentId || record.id) }
function formatValue(value: unknown) { if (value === null || value === undefined || value === '') return '-'; if (typeof value === 'object') return JSON.stringify(value); return String(value) }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
