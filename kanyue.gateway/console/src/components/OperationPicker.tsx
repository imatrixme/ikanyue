import { listRecords, type BaseRecord } from '../lib/api'
import { useResource } from '../lib/useResource'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Checkbox } from './ui/Controls'
import { Alert, ErrorText, Muted } from './ui/Feedback'

export interface Operation extends BaseRecord {
  service: string
  method: string
  path: string
  module: string
  auth: string
  idempotent: boolean
  status: 'pending' | 'active' | 'removed'
}

export function OperationStatus({ status }: { status: Operation['status'] }) {
  if (status === 'active') return <Badge tone="green">已上线过</Badge>
  if (status === 'removed') return <Badge tone="red">已移除</Badge>
  return <Badge tone="amber">待接入</Badge>
}

interface OperationPickerProps {
  service: string
  value: string[]
  onChange: (value: string[]) => void
}

// OperationPicker lists a service's discovered operations to register as
// APIs. Nothing is preselected and new operations are never added for the
// operator: exactly the ticked ones are registered, so internal endpoints stay
// private unless someone deliberately selects them.
export function OperationPicker({ service, value, onChange }: OperationPickerProps) {
  const ops = useResource(`operations:${service}`, () => service
    ? listRecords<Operation>('operations', `filter=${encodeURIComponent(`service="${service}"`)}&sort=module,path,method`)
    : Promise.resolve([]))
  if (!service) return <Muted>先选择服务</Muted>
  if (ops.error) return <ErrorText error={ops.error} />
  const list = ops.data ?? []
  if (list.length === 0) return <Muted>{ops.loading ? '加载中…' : '该服务还没有发现任何接口'}</Muted>

  const known = new Set(list.map((op) => op.id))
  const chosen = new Set(value.filter((id) => known.has(id)))
  const foreign = value.length - chosen.size
  const update = (ids: string[], selected: boolean) => {
    const next = new Set(chosen)
    for (const id of ids) {
      if (selected) next.add(id)
      else next.delete(id)
    }
    onChange([...next])
  }
  const groups = new Map<string, Operation[]>()
  for (const op of list) {
    const module = op.module || '未分组'
    groups.set(module, [...(groups.get(module) ?? []), op])
  }

  return (
    <div className="grid gap-3">
      <Muted>已选 {chosen.size} / {list.length} 个接口。新发现的接口不会自动加入；内部接口不要勾选。</Muted>
      {foreign > 0 ? (
        <Alert tone="error">
          有 {foreign} 个已选接口不属于当前服务，不会被登记。
          <Button className="ml-2" onClick={() => onChange([...chosen])}>移除这些接口</Button>
        </Alert>
      ) : null}
      <div className="max-h-96 overflow-auto rounded-md border border-[var(--border)] p-3">
        {[...groups].map(([module, members]) => (
          <fieldset className="mb-3" key={module}>
            <legend className="flex items-center gap-2 text-sm font-semibold">
              {module}
              <Button className="h-6 px-2 text-xs" onClick={() => update(members.filter((op) => op.status !== 'removed').map((op) => op.id), true)} variant="ghost">全选本组</Button>
              <Button className="h-6 px-2 text-xs" onClick={() => update(members.map((op) => op.id), false)} variant="ghost">清空本组</Button>
            </legend>
            {members.map((op) => (
              <Checkbox
                checked={chosen.has(op.id)}
                className="flex font-mono text-xs"
                disabled={op.status === 'removed' && !chosen.has(op.id)}
                key={op.id}
                label={<>{op.method || '任意'} {op.path} {op.auth ? <Badge>{op.auth}</Badge> : null}{op.status !== 'active' ? <OperationStatus status={op.status} /> : null}</>}
                onChange={(event) => update([op.id], event.target.checked)}
              />
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  )
}
