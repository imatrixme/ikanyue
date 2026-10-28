import { stageLabels, stages, type State, type States, type Target, targetKey } from '../lib/gateway'
import { Badge, type BadgeTone } from './ui/Badge'

const statusLabels: Record<State['status'], { label: string; tone: BadgeTone }> = {
  unreleased: { label: '未上线', tone: 'neutral' },
  offline: { label: '已下线', tone: 'neutral' },
  current: { label: '已上线', tone: 'green' },
  changed: { label: '有改动', tone: 'amber' },
  error: { label: '草稿有误', tone: 'red' },
}

// StageStates shows a target in every environment: its served version and
// whether its draft differs from what is served.
export function StageStates({ states, target }: { states: States | undefined; target: Target }) {
  const row = states?.[targetKey(target)]
  return (
    <span className="flex flex-wrap gap-1">
      {stages.map((stage) => {
        const state = row?.[stage]
        if (!state) return <Badge key={stage}>{stageLabels[stage]} —</Badge>
        const { label, tone } = statusLabels[state.status]
        return (
          <Badge key={stage} title={state.error} tone={tone}>
            {stageLabels[stage]} {label}{state.version ? ` v${state.version}` : ''}
          </Badge>
        )
      })}
    </span>
  )
}
