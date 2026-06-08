import { Check, Info, Search, UserMinus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { filterPeople, selectedPeopleFirst, type LockedContext, type PersonOption } from '../../app/sceneWorkspaces'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Input'
import { SemanticSurface } from '../ui/SemanticSurface'
import { Select, type SelectOption } from '../ui/Select'
import { Sheet } from '../ui/Sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip'
import { cn } from '../ui/utils'

interface LockedContextCardProps {
  context: LockedContext | null
  label: string
}

export function LockedContextCard({ context, label }: LockedContextCardProps) {
  return (
    <SemanticSurface className="p-3" tone={context ? 'brand' : 'warning'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--accent-foreground)]">{label}</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{context?.title || '尚未选择上下文'}</h3>
          <p className="mt-1 text-xs opacity-75 [overflow-wrap:anywhere]">{context?.subtitle || '请先选择一个班级或课堂'}</p>
        </div>
        <Badge tone={context ? 'blue' : 'amber'}>{context ? '已锁定' : '待选择'}</Badge>
      </div>
    </SemanticSurface>
  )
}

interface PeopleRosterProps {
  title: string
  people: PersonOption[]
  emptyLabel: string
}

export function PeopleRoster({ title, people, emptyLabel }: PeopleRosterProps) {
  const selected = people.filter((person) => person.selected)
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--muted-foreground)]">{new Intl.NumberFormat('zh-CN').format(selected.length)} 人已关联</p>
        </div>
        <SelectedAvatarGroup people={selected} />
      </div>
      <div className="mt-3 grid gap-2">
        {selected.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted-foreground)]">{emptyLabel}</div> : null}
        {selected.slice(0, 6).map((person) => <PersonRow key={person.id} person={person} selected />)}
      </div>
    </section>
  )
}

export function SelectedAvatarGroup({ people }: { people: PersonOption[] }) {
  if (people.length === 0) {
    return <Badge>未选择</Badge>
  }
  return (
    <TooltipProvider>
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((person) => (
          <Tooltip key={person.id}>
            <TooltipTrigger asChild>
              <span className="inline-flex rounded-md ring-2 ring-[var(--card)]">
                <PersonAvatar person={person} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{person.name} · {person.secondary}</TooltipContent>
          </Tooltip>
        ))}
        {people.length > 5 ? <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 text-xs font-semibold">+{new Intl.NumberFormat('zh-CN').format(people.length - 5)}</span> : null}
      </div>
    </TooltipProvider>
  )
}

interface PeopleActionDialogProps {
  open: boolean
  title: string
  description: string
  context: LockedContext | null
  contextLabel: string
  people: PersonOption[]
  optionLabel: string
  modeLabel: string
  modeOptions: SelectOption[]
  defaultMode: string
  submitting?: boolean
  onClose: () => void
  onSubmit: (selectedIds: string[], mode: string) => void
}

export function PeopleActionDialog({
  open,
  title,
  description,
  context,
  contextLabel,
  people,
  optionLabel,
  modeLabel,
  modeOptions,
  defaultMode,
  submitting = false,
  onClose,
  onSubmit,
}: PeopleActionDialogProps) {
  if (!open) {
    return null
  }

  return (
    <PeopleActionDialogSession
      key={`${title}-${context?.id || 'no-context'}-${people.map((person) => `${person.id}:${person.selected}`).join('|')}`}
      open={open}
      title={title}
      description={description}
      context={context}
      contextLabel={contextLabel}
      people={people}
      optionLabel={optionLabel}
      modeLabel={modeLabel}
      modeOptions={modeOptions}
      defaultMode={defaultMode}
      submitting={submitting}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}

function PeopleActionDialogSession({
  open,
  title,
  description,
  context,
  contextLabel,
  people,
  optionLabel,
  modeLabel,
  modeOptions,
  defaultMode,
  submitting,
  onClose,
  onSubmit,
}: PeopleActionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => people.filter((person) => person.selected).map((person) => person.id))
  const [mode, setMode] = useState(defaultMode)
  const [query, setQuery] = useState('')
  const orderedPeople = useMemo(() => filterPeople(selectedPeopleFirst(people, selectedIds), query), [people, query, selectedIds])
  const selectedPeople = people.filter((person) => selectedIds.includes(person.id))
  const selectedModeLabel = modeOptions.find((option) => option.value === mode)?.label || mode

  function togglePerson(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <Sheet
      open={open}
      title={title}
      description={description}
      side="right"
      onClose={onClose}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--muted-foreground)]">
            {context ? `将在“${context.title}”下保存 ${new Intl.NumberFormat('zh-CN').format(selectedIds.length)} 人。` : '还没有锁定班级或课堂，无法保存。'}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
            <Button disabled={!context || selectedIds.length === 0 || submitting} type="button" onClick={() => onSubmit(selectedIds, mode)} icon={<Check className="h-4 w-4" aria-hidden="true" />}>
              {submitting ? '保存中' : saveButtonLabel(modeLabel)}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="grid min-h-[560px] gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="grid content-start gap-4">
          <LockedContextCard context={context} label={contextLabel} />
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
            <Field label={modeLabel}>
              <Select aria-label={modeLabel} value={mode} options={modeOptions} onChange={(event) => setMode(event.target.value)} />
            </Field>
            <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
              本次选择的人都会标记为“{selectedModeLabel}”。不同角色或不同出勤状态请分次保存，避免混在一起。
            </p>
          </div>
          <PeopleActionReview
            context={context}
            contextLabel={contextLabel}
            modeLabel={modeLabel}
            selectedModeLabel={selectedModeLabel}
            selectedPeople={selectedPeople}
            compact
          />
        </aside>

        <div className="min-w-0">
          <div className="grid gap-4">
            <Field label={optionLabel}>
              <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-2">
                <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--input)] bg-[var(--card)] px-2 shadow-sm">
                  <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                  <Input aria-label={`${optionLabel}搜索`} className="h-8 border-0 px-0 focus:ring-0" placeholder="搜索姓名、手机号、状态" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="max-h-[460px] overflow-y-auto rounded-md bg-[var(--card)]">
                  {orderedPeople.map((person) => (
                    <button
                      key={person.id}
                      aria-label={`选择${person.name}`}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-left transition last:border-0 hover:bg-[var(--muted)]/45',
                        selectedIds.includes(person.id) && 'bg-[var(--brand-soft)]/70',
                      )}
                      onClick={() => togglePerson(person.id)}
                      type="button"
                    >
                      <PersonAvatar person={person} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold">{person.name}</span>
                          {person.selected ? <Badge tone="green">已在关系中</Badge> : null}
                        </div>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">{person.secondary}</p>
                      </div>
                      <PersonDetailTooltip person={person} />
                      <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded border text-xs', selectedIds.includes(person.id) ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' : 'border-[var(--border)] text-transparent')}>
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                  {orderedPeople.length === 0 ? <div className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]">没有匹配的人物</div> : null}
                </div>
              </div>
            </Field>
            <SelectedPeopleSummary selectedPeople={selectedPeople} onRemove={togglePerson} />
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function SelectedPeopleSummary({ selectedPeople, onRemove }: { selectedPeople: PersonOption[]; onRemove: (id: string) => void }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Users className="h-4 w-4 text-[var(--accent-foreground)]" aria-hidden="true" />
        已选人物
      </div>
      <SelectedAvatarGroup people={selectedPeople} />
      <div className="mt-3 grid gap-1">
        {selectedPeople.map((person) => (
          <button key={person.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--muted)]" onClick={() => onRemove(person.id)} type="button">
            <span className="truncate">{person.name}</span>
            <UserMinus className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
          </button>
        ))}
        {selectedPeople.length === 0 ? <p className="text-xs text-[var(--muted-foreground)]">还没有选择人物</p> : null}
      </div>
    </div>
  )
}

function PeopleActionReview({
  context,
  contextLabel,
  modeLabel,
  selectedModeLabel,
  selectedPeople,
  compact = false,
}: {
  context: LockedContext | null
  contextLabel: string
  modeLabel: string
  selectedModeLabel: string
  selectedPeople: PersonOption[]
  compact?: boolean
}) {
  return (
    <div className="grid gap-4">
      {!compact ? <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-4">
        <div className="text-xs font-semibold text-[var(--muted-foreground)]">{contextLabel}</div>
        <div className="mt-1 text-base font-semibold">{context?.title || '尚未选择上下文'}</div>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{context?.subtitle || '缺少上下文，无法提交'}</p>
      </div> : null}
      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{compact ? '本次保存' : '保存前检查'}</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{modeLabel}：{selectedModeLabel}</p>
          </div>
          <Badge tone={selectedPeople.length > 0 ? 'blue' : 'amber'}>{new Intl.NumberFormat('zh-CN').format(selectedPeople.length)} 人</Badge>
        </div>
        <div className="mt-3 grid gap-2">
          {selectedPeople.slice(0, compact ? 6 : selectedPeople.length).map((person) => (
            <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2" key={person.id}>
              <PersonAvatar person={person} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{person.name}</div>
                <p className="truncate text-xs text-[var(--muted-foreground)]">{person.secondary}</p>
              </div>
              <Badge>{selectedModeLabel}</Badge>
            </div>
          ))}
          {compact && selectedPeople.length > 6 ? <div className="text-xs text-[var(--muted-foreground)]">还有 {new Intl.NumberFormat('zh-CN').format(selectedPeople.length - 6)} 人，保存前可在右侧已选列表查看。</div> : null}
          {selectedPeople.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">还没有选择人物</div> : null}
        </div>
      </div>
    </div>
  )
}

export function PersonRow({ person, selected = false }: { person: PersonOption; selected?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
      <PersonAvatar person={person} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{person.name}</span>
          {person.role ? <Badge>{person.role}</Badge> : null}
          {person.relationStatus ? <Badge tone={selected ? 'green' : 'neutral'}>{person.relationStatus}</Badge> : null}
        </div>
        <p className="truncate text-xs text-[var(--muted-foreground)]">{person.secondary}</p>
      </div>
      <PersonDetailTooltip person={person} />
    </div>
  )
}

function PersonAvatar({ person }: { person: PersonOption }) {
  return (
    <Avatar>
      {person.avatar ? <AvatarImage alt={person.name} src={person.avatar} /> : null}
      <AvatarFallback>{person.name.trim().slice(0, 2) || '?'}</AvatarFallback>
    </Avatar>
  )
}

function saveButtonLabel(modeLabel: string) {
  if (modeLabel.includes('出勤')) {
    return '保存出勤'
  }
  if (modeLabel.includes('角色')) {
    return '保存分工'
  }
  if (modeLabel.includes('状态')) {
    return '保存学员'
  }
  return '保存'
}

function PersonDetailTooltip({ person }: { person: PersonOption }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <Info className="h-4 w-4" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="grid gap-1">
            <div className="font-semibold">{person.name}</div>
            <div>{person.secondary}</div>
            <div>{person.status || '状态未知'}</div>
            {person.relationStatus ? <div>当前关系：{person.relationStatus}</div> : null}
            {person.role ? <div>角色：{person.role}</div> : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
