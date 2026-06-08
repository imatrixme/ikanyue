import { Button } from '../ui/Button'
import { SemanticSurface } from '../ui/SemanticSurface'

export type SceneWorkspaceStep = 'intent' | 'target' | 'work'

export interface SceneLocatorTask {
  key: string
  title: string
  description: string
}

interface SceneWorkspaceFocusProps {
  task?: SceneLocatorTask
  objectLabel: string
  onChangeContext: () => void
}

export function SceneWorkspaceFocus({ task, objectLabel, onChangeContext }: SceneWorkspaceFocusProps) {
  return (
    <SemanticSurface className="flex flex-wrap items-center justify-between gap-3" tone="brand">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--accent-foreground)]">当前任务</p>
        <h3 className="mt-0.5 truncate text-sm font-semibold text-[var(--accent-foreground)]">{task?.title || '处理场景任务'}</h3>
        {task?.description ? <p className="mt-1 text-xs text-[var(--accent-foreground)]/75 [overflow-wrap:anywhere]">{task.description}</p> : null}
      </div>
      <Button type="button" variant="secondary" onClick={onChangeContext}>更换{objectLabel}</Button>
    </SemanticSurface>
  )
}
