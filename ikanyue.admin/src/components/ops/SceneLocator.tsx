import { Button } from '../ui/Button'

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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-200 bg-cyan-50/60 px-4 py-3">
      <div>
        <p className="text-xs font-medium text-cyan-700">当前任务</p>
        <h3 className="mt-0.5 text-sm font-semibold text-cyan-950">{task?.title || '处理场景任务'}</h3>
        {task?.description ? <p className="mt-1 text-xs text-cyan-900/75">{task.description}</p> : null}
      </div>
      <Button type="button" variant="secondary" onClick={onChangeContext}>更换{objectLabel}</Button>
    </div>
  )
}
