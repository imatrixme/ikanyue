import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ResourceRecord } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Sheet } from '../ui/Sheet'
import { cn } from '../ui/utils'
import type { SceneLocatorTask, SceneWorkspaceStep } from './SceneLocator'
import {
  objectContext,
  objectSearchText,
  objectStatus,
  objectSubtitle,
  objectTitle,
  type SceneObjectKind,
} from './sceneObjectDisplay'

interface SceneSetupDialogProps {
  open: boolean
  title: string
  description: string
  intentTitle: string
  intentDescription: string
  targetTitle: string
  targetDescription: string
  objectLabel: string
  tasks: SceneLocatorTask[]
  selectedTask: string
  objects: ResourceRecord[]
  pendingId: string
  kind: SceneObjectKind
  onTaskChange: (task: string) => void
  onPendingChange: (id: string) => void
  onConfirm: () => void
  onClose: () => void
}

type SetupStep = Exclude<SceneWorkspaceStep, 'work'>

export function SceneSetupDialog({
  open,
  title,
  description,
  intentTitle,
  intentDescription,
  targetTitle,
  targetDescription,
  objectLabel,
  tasks,
  selectedTask,
  objects,
  pendingId,
  kind,
  onTaskChange,
  onPendingChange,
  onConfirm,
  onClose,
}: SceneSetupDialogProps) {
  const [activeStep, setActiveStep] = useState<SetupStep>('intent')
  const selectedTaskConfig = tasks.find((task) => task.key === selectedTask) || tasks[0]
  const selectedObject = objects.find((object) => String(object.id) === pendingId) || null

  if (!open) {
    return null
  }

  return (
    <Sheet
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      className="w-[min(1080px,calc(100vw-2rem))]"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--muted-foreground)]">
            {activeStep === 'intent' ? '先确认工作动机，下一步再选择具体对象。' : selectedObject ? `将锁定 ${objectLabel}：${objectTitle(selectedObject)}` : `请选择一个${objectLabel}`}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
            {activeStep === 'target' ? <Button type="button" variant="secondary" onClick={() => setActiveStep('intent')}>上一步</Button> : null}
            {activeStep === 'intent' ? (
              <Button type="button" onClick={() => setActiveStep('target')}>下一步：确认{objectLabel}</Button>
            ) : (
              <Button type="button" disabled={!selectedObject} onClick={onConfirm}>进入{objectLabel}工作台</Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="grid min-h-[560px] gap-5 lg:grid-cols-[220px_1fr]">
        <SceneWizardRail current={activeStep} objectLabel={objectLabel} />
        <div className="min-w-0">
          {activeStep === 'intent' ? (
            <SceneIntentFields
              title={intentTitle}
              description={intentDescription}
              tasks={tasks}
              selectedTask={selectedTask}
              objectLabel={objectLabel}
              onSelectTask={onTaskChange}
            />
          ) : (
            <SceneObjectFields
              title={targetTitle}
              description={targetDescription}
              objectLabel={objectLabel}
              selectedTask={selectedTaskConfig}
              objects={objects}
              pendingId={pendingId}
              kind={kind}
              onPendingChange={onPendingChange}
            />
          )}
        </div>
      </div>
    </Sheet>
  )
}

function SceneWizardRail({ current, objectLabel }: { current: SetupStep; objectLabel: string }) {
  const steps: Array<{ key: SetupStep; title: string; description: string }> = [
    { key: 'intent', title: '确认任务', description: '这次要完成什么事' },
    { key: 'target', title: `确认${objectLabel}`, description: '搜索并锁定对象' },
  ]
  const currentIndex = steps.findIndex((step) => step.key === current)

  return (
    <aside className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-3">
      <div className="grid gap-2">
        {steps.map((step, index) => {
          const active = step.key === current
          const done = index < currentIndex
          return (
            <div
              className={cn(
                'grid grid-cols-[28px_1fr] gap-2 rounded-md border px-2 py-3',
                active && 'border-cyan-300 bg-cyan-50 text-cyan-950',
                done && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                !active && !done && 'border-transparent text-[var(--muted-foreground)]',
              )}
              key={step.key}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold',
                  active && 'border-cyan-300 bg-white text-cyan-800',
                  done && 'border-emerald-200 bg-white text-emerald-700',
                  !active && !done && 'border-[var(--border)] bg-[var(--card)]',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-1 block text-xs leading-5 text-inherit opacity-75">{step.description}</span>
              </span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

interface SceneIntentFieldsProps {
  title: string
  description: string
  tasks: SceneLocatorTask[]
  selectedTask: string
  objectLabel: string
  onSelectTask: (task: string) => void
}

function SceneIntentFields({ title, description, tasks, selectedTask, objectLabel, onSelectTask }: SceneIntentFieldsProps) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--muted-foreground)]">第一步</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
        <Badge tone="amber">尚未选择{objectLabel}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {tasks.map((task) => {
          const active = task.key === selectedTask
          return (
            <button
              aria-pressed={active}
              className={cn(
                'grid min-h-32 gap-2 rounded-md border p-4 text-left transition',
                active ? 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-sm' : 'border-[var(--border)] bg-[var(--card)] hover:border-cyan-200 hover:bg-cyan-50/40',
              )}
              key={task.key}
              onClick={() => onSelectTask(task.key)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-semibold">{task.title}</div>
                {active ? <Check className="mt-0.5 h-4 w-4 text-cyan-700" aria-hidden="true" /> : null}
              </div>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{task.description}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

interface SceneObjectFieldsProps {
  title: string
  description: string
  objectLabel: string
  selectedTask?: SceneLocatorTask
  objects: ResourceRecord[]
  pendingId: string
  kind: SceneObjectKind
  onPendingChange: (id: string) => void
}

function SceneObjectFields({ title, description, objectLabel, selectedTask, objects, pendingId, kind, onPendingChange }: SceneObjectFieldsProps) {
  const [query, setQuery] = useState('')
  const pendingObject = objects.find((object) => String(object.id) === pendingId) || null
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return objects
    }
    return objects.filter((object) => objectSearchText(object).includes(keyword))
  }, [objects, query])

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--muted-foreground)]">第二步</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
        {selectedTask ? <Badge tone="blue">{selectedTask.title}</Badge> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="grid content-start gap-3">
          <div className="flex h-10 items-center rounded-md border border-[var(--input)] bg-[var(--card)] px-2 shadow-sm">
            <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            <Input
              aria-label={`${objectLabel}搜索`}
              className="h-9 border-0 px-2 focus:ring-0"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${objectLabel}名称、状态、主题或地点`}
            />
          </div>
          <div className="max-h-[360px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)]">
            <SceneObjectTable filtered={filtered} pendingId={pendingId} kind={kind} objectLabel={objectLabel} onPendingChange={onPendingChange} />
          </div>
        </div>

        <aside className="grid content-start gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
          <div>
            <p className="text-xs font-semibold text-[var(--muted-foreground)]">已选{objectLabel}</p>
            {pendingObject ? (
              <div className="mt-2 rounded-md border border-cyan-200 bg-cyan-50 p-3">
                <div className="font-semibold text-cyan-950">{objectTitle(pendingObject)}</div>
                <p className="mt-1 text-xs text-cyan-900/75">{objectSubtitle(pendingObject, kind)}</p>
                <p className="mt-1 text-xs text-cyan-900/75">{objectContext(pendingObject, kind)}</p>
              </div>
            ) : (
              <div className="mt-2 rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                请先从左侧选择一个{objectLabel}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function SceneObjectTable({
  filtered,
  pendingId,
  kind,
  objectLabel,
  onPendingChange,
}: {
  filtered: ResourceRecord[]
  pendingId: string
  kind: SceneObjectKind
  objectLabel: string
  onPendingChange: (id: string) => void
}) {
  return (
    <table className="w-full min-w-[640px] border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-[var(--muted)] text-[var(--muted-foreground)]">
        <tr>
          <th className="px-3 py-2 font-medium">{objectLabel}</th>
          <th className="px-3 py-2 font-medium">状态</th>
          <th className="px-3 py-2 font-medium">上下文</th>
          <th className="px-3 py-2 text-right font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((object) => {
          const active = String(object.id) === pendingId
          return (
            <tr
              className={cn('border-t border-[var(--border)] hover:bg-[var(--muted)]/35', active && 'bg-cyan-50/70')}
              key={String(object.id)}
            >
              <td className="px-3 py-2">
                <button className="block max-w-sm text-left" onClick={() => onPendingChange(String(object.id))} type="button">
                  <span className="block text-sm font-semibold">{objectTitle(object)}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted-foreground)]">{objectSubtitle(object, kind)}</span>
                </button>
              </td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{objectStatus(object, kind)}</td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{objectContext(object, kind)}</td>
              <td className="px-3 py-2 text-right">
                <Button className="h-8" variant={active ? 'secondary' : 'ghost'} onClick={() => onPendingChange(String(object.id))} type="button">
                  {active ? '已选择' : '选择'}
                </Button>
              </td>
            </tr>
          )
        })}
        {filtered.length === 0 ? (
          <tr>
            <td className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]" colSpan={4}>
              没有匹配的{objectLabel}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
