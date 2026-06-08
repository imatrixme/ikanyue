import { Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { displayResourceField, fieldRelationOptions, recordLabel, type ResourceFormField } from '../../app/resourceForms'
import type { OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { FloatingTooltip } from './FloatingTooltip'
import { Input } from './Input'
import { Avatar, AvatarFallback, AvatarImage } from './Avatar'
import { cn } from './utils'

interface EntityPickerProps {
  id?: string
  label: string
  value: string | string[]
  resources: OpsResource[]
  lookup?: ResourceLookup
  multiple?: boolean
  emptyLabel?: string
  onValueChange: (value: string | string[]) => void
}

interface EntityOption {
  label: string
  record: ResourceRecord
  resource: OpsResource
  value: string
}

const resourceLabels: Partial<Record<OpsResource, string>> = {
  activities: '活动',
  audioMaterials: '音频',
  learningPrograms: '班级',
  learningSessions: '课堂',
  reportInstances: '报告',
  reportTemplates: '模板',
  students: '学员',
  teachers: '教师',
  videoMaterials: '视频',
}

export function EntityPicker({ id, label, value, resources, lookup = {}, multiple = false, emptyLabel = '暂无可选项', onValueChange }: EntityPickerProps) {
  const [query, setQuery] = useState('')
  const selectedValues = Array.isArray(value) ? value : value ? [value] : []
  const options = useMemo(() => collectOptions(resources, lookup), [lookup, resources])
  const selected = selectedValues.map((item) => options.find((option) => option.value === item)).filter((item): item is EntityOption => Boolean(item))
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const list = keyword ? options.filter((option) => searchText(option).includes(keyword)) : options
    return list.slice(0, 20)
  }, [options, query])

  function setSelected(nextValue: string) {
    if (!multiple) {
      onValueChange(nextValue)
      return
    }
    onValueChange(selectedValues.includes(nextValue) ? selectedValues.filter((item) => item !== nextValue) : [...selectedValues, nextValue])
  }

  return (
    <div className="grid gap-2 rounded-md border border-[var(--input)] bg-[var(--card)] p-2 shadow-sm">
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/25 px-2">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        <Input
          aria-label={label}
          className="h-8 w-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          id={id}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={options.length > 0 ? '搜索姓名、标题、手机号或编号' : emptyLabel}
          value={query}
        />
      </div>
      <SelectedEntities label={label} onRemove={multiple ? (nextValue) => setSelected(nextValue) : undefined} selected={selected} />
      <div className="max-h-64 overflow-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[var(--muted)] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">对象</th>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 text-right font-medium">选择</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((option) => {
              const checked = selectedValues.includes(option.value)
              return (
                <tr className="border-t border-[var(--border)] hover:bg-[var(--muted)]/35" key={`${option.resource}-${option.value}`}>
                  <td className="px-3 py-2">
                    <EntityIdentity option={option} />
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{resourceLabels[option.resource] || option.resource}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{entityStatus(option)}</td>
                  <td className="px-3 py-2 text-right">
                    {multiple ? (
                      <input aria-label={option.label} checked={checked} className="h-4 w-4" onChange={() => setSelected(option.value)} type="checkbox" />
                    ) : (
                      <button
                        className={cn('rounded px-2 py-1 text-xs font-medium transition-colors', checked ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)]')}
                        onClick={() => setSelected(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]" colSpan={4}>
                  {options.length > 0 ? '没有找到匹配结果' : emptyLabel}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {selected.length === 0 && selectedValues.length > 0 ? <div className="text-xs text-[var(--warning-foreground)]">当前值没有在已加载选项中找到：{selectedValues.join('、')}</div> : null}
      {selected.length === 1 && !multiple ? <div className="text-xs text-[var(--muted-foreground)]">当前选择：{selected[0].label}</div> : null}
    </div>
  )
}

function SelectedEntities({ label, selected, onRemove }: { label: string; selected: EntityOption[]; onRemove?: (value: string) => void }) {
  if (selected.length === 0) {
    return <div className="rounded-md bg-[var(--muted)]/25 px-2 py-1.5 text-xs text-[var(--muted-foreground)]">未选择{label}</div>
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--muted)]/25 px-2 py-1.5">
      <span className="text-xs text-[var(--muted-foreground)]">已选</span>
      {selected.map((option) => (
        <EntityChip key={option.value} onRemove={onRemove} option={option} />
      ))}
    </div>
  )
}

function EntityChip({ option, onRemove }: { option: EntityOption; onRemove?: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div className="relative inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 shadow-sm" onBlur={() => setOpen(false)} onFocus={() => setOpen(true)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} ref={anchorRef} tabIndex={0}>
      <EntityAvatar option={option} />
      <span className="max-w-[120px] truncate text-xs font-medium">{option.label}</span>
      {onRemove ? (
        <Button aria-label={`移除${option.label}`} className="h-5 w-5 px-0" icon={<X className="h-3 w-3" aria-hidden="true" />} onClick={() => onRemove(option.value)} type="button" variant="ghost" />
      ) : null}
      <FloatingTooltip anchorRef={anchorRef} open={open} width={320}>
        <EntityDetails option={option} />
      </FloatingTooltip>
    </div>
  )
}

function EntityIdentity({ option }: { option: EntityOption }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div className="flex items-center gap-2" onBlur={() => setOpen(false)} onFocus={() => setOpen(true)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} ref={anchorRef} tabIndex={0}>
      <EntityAvatar option={option} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{option.label}</div>
        <div className="truncate text-[11px] text-[var(--muted-foreground)]">{entitySubtitle(option)}</div>
      </div>
      <FloatingTooltip anchorRef={anchorRef} open={open} width={360}>
        <EntityDetails option={option} />
      </FloatingTooltip>
    </div>
  )
}

function EntityAvatar({ option }: { option: EntityOption }) {
  const avatar = typeof option.record.avatar === 'string' ? option.record.avatar : ''
  const initials = option.label.slice(0, 2)
  return (
    <Avatar>
      {avatar ? <AvatarImage alt={`${option.label}头像`} src={avatar} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}

function EntityDetails({ option }: { option: EntityOption }) {
  const lines = [
    ['名称', option.label],
    ['类型', resourceLabels[option.resource] || option.resource],
    ['手机号', option.record.cellphone],
    ['地点', option.record.location],
    ['状态', entityStatus(option)],
    ['记录编号', option.record.id],
  ].filter((line): line is [string, string] => Boolean(line[1]))
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <EntityAvatar option={option} />
        <div>
          <div className="text-sm font-semibold">{option.label}</div>
          <Badge>{resourceLabels[option.resource] || option.resource}</Badge>
        </div>
      </div>
      <div className="grid gap-1 text-xs">
        {lines.map(([key, item]) => (
          <div className="grid grid-cols-[56px_1fr] gap-2" key={key}>
            <span className="text-[var(--muted-foreground)]">{key}</span>
            <span className="break-all">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function collectOptions(resources: OpsResource[], lookup: ResourceLookup): EntityOption[] {
  return resources.flatMap((resource) => {
    const relationField: ResourceFormField = { key: resource, label: resource, relation: resource }
    const labels = new Map(fieldRelationOptions(relationField, lookup).map((option) => [option.value, option.label]))
    return (lookup[resource]?.items || []).map((record) => ({
      label: labels.get(String(record.id)) || recordLabel(record),
      record,
      resource,
      value: String(record.id),
    }))
  })
}

function searchText(option: EntityOption) {
  return `${option.label} ${option.value} ${Object.values(option.record).join(' ')}`.toLowerCase()
}

function entitySubtitle(option: EntityOption) {
  return String(option.record.cellphone || option.record.location || option.record.theme || option.record.type || option.record.reportType || option.value)
}

function entityStatus(option: EntityOption) {
  if (option.record.blocked === true) {
    return '禁用'
  }
  if (option.record.verified === false) {
    return '待审核'
  }
  return displayResourceField(option.resource, 'status', option.record.status)
}
