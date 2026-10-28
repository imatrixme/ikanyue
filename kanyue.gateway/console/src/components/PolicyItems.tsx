import { useState } from 'react'

import { errorText, request } from '../lib/api'
import { gateway, itemsOf, stageLabels, stages, type Impacted, type PolicyItem, type Stage } from '../lib/gateway'
import { useResource } from '../lib/useResource'
import { SchemaForm, type JSONSchema } from './SchemaForm'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Checkbox, Input } from './ui/Controls'
import { Alert, ErrorText, Muted } from './ui/Feedback'

interface PluginInfo {
  name: string
  priority: number
  schema: JSONSchema
}

// Plugins are fixed for a gateway build; the list is fetched once per page.
let pluginList: Promise<PluginInfo[]> | null = null
const loadPlugins = () => (pluginList ??= request<PluginInfo[]>('GET', '/gateway/v1/plugins').catch((error: unknown) => {
  pluginList = null
  throw error
}))

// Authentication is chosen per API; its plugins only carry settings here.
const authPlugins = new Set(['aliyun-signature', 'jwt-auth'])

export type ItemsKind = 'set' | 'override' | 'application'

const kindHints: Record<ItemsKind, string> = {
  set: '锁定的策略下层不能修改或关闭（限流仍可叠加）；限流逐层叠加，其他插件下层覆盖上层。',
  override: '只作用于本 API：同名插件覆盖策略组，“关闭”可去掉继承的未锁定策略，限流叠加。',
  application: '只作用于该应用的请求：可替换、追加或关闭未锁定的策略；鉴权不按应用配置。',
}

interface PolicyItemsProps {
  kind: ItemsKind
  value: PolicyItem[]
  onChange: (value: PolicyItem[]) => void
  // impact previews the unsaved list against the stored record.
  impact?: { collection: string; id?: string; field: string }
}

export function PolicyItems({ kind, value, onChange, impact }: PolicyItemsProps) {
  const plugins = useResource('plugins', loadPlugins)
  const update = (index: number, patch: Partial<PolicyItem>) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const available = (plugins.data ?? []).filter((plugin) => kind !== 'application' || !authPlugins.has(plugin.name))
  return (
    <div className="grid gap-3">
      <Muted>{kindHints[kind]}</Muted>
      <ErrorText error={plugins.error} />
      {value.map((item, index) => {
        const info = plugins.data?.find((plugin) => plugin.name === item.plugin)
        return (
          <fieldset className="grid gap-2 rounded-md border border-[var(--border)] p-3" key={index}>
            <legend className="px-1 text-xs font-semibold">
              {item.plugin || '新策略'}
              {item.locked ? <Badge className="ml-2" tone="amber">锁定</Badge> : null}
              {item.disabled ? <Badge className="ml-2" tone="red">关闭</Badge> : null}
            </legend>
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="插件"
                className="h-9 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm"
                onChange={(event) => update(index, { plugin: event.target.value, config: {} })}
                value={item.plugin}
              >
                <option value="">请选择插件</option>
                {available.map((plugin) => <option key={plugin.name} value={plugin.name}>{plugin.name}（优先级 {plugin.priority}）</option>)}
              </select>
              {kind !== 'application' ? (
                <Checkbox checked={Boolean(item.disabled)} label="关闭继承的同名策略" onChange={(event) => update(index, { disabled: event.target.checked, locked: false })} />
              ) : null}
              {kind === 'set' && !item.disabled ? (
                <Checkbox checked={Boolean(item.locked)} label="锁定（下层不可改）" onChange={(event) => update(index, { locked: event.target.checked })} />
              ) : null}
              <Input
                aria-label="优先级"
                className="w-28"
                onChange={(event) => update(index, { priority: Number(event.target.value) || undefined })}
                placeholder="优先级"
                type="number"
                value={item.priority ?? ''}
              />
              <Button onClick={() => onChange(value.filter((_, i) => i !== index))} variant="ghost">移除</Button>
            </div>
            <span className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs text-[var(--muted-foreground)]">环境（不选为全部）</span>
              {stages.map((stage) => (
                <Checkbox
                  checked={item.stages?.includes(stage) ?? false}
                  key={stage}
                  label={stageLabels[stage]}
                  onChange={(event) => {
                    const next = new Set<Stage>(item.stages ?? [])
                    if (event.target.checked) next.add(stage)
                    else next.delete(stage)
                    update(index, { stages: next.size ? stages.filter((s) => next.has(s)) : undefined })
                  }}
                />
              ))}
            </span>
            {item.disabled ? null : info ? (
              <SchemaForm key={item.plugin} onChange={(config) => update(index, { config: config as Record<string, unknown> })} schema={info.schema} value={item.config ?? {}} />
            ) : item.plugin ? <Muted>{plugins.loading ? '加载中…' : `未知插件 ${item.plugin}`}</Muted> : null}
          </fieldset>
        )
      })}
      <div className="flex gap-2">
        <Button onClick={() => onChange([...value, { plugin: '' }])}>添加策略</Button>
        {impact?.id ? <ImpactButton collection={impact.collection} fields={{ [impact.field]: value }} id={impact.id} /> : null}
      </div>
    </div>
  )
}

function ImpactButton({ collection, id, fields }: { collection: string; id: string; fields: Record<string, unknown> }) {
  const [result, setResult] = useState<Impacted[] | null>(null)
  const [error, setError] = useState('')
  const preview = async () => {
    setError('')
    try {
      setResult((await gateway.impact(collection, id, fields)) ?? [])
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  const refused = result?.filter((row) => row.error) ?? []
  return (
    <span className="grid flex-1 gap-1">
      <Button className="justify-self-start" onClick={preview}>预览影响</Button>
      <ErrorText error={error} />
      {result ? (
        <Alert tone={refused.length ? 'error' : 'info'}>
          {result.length === 0
            ? '不影响任何 API 的生效策略。'
            : `影响 ${new Set(result.map((row) => row.id)).size} 个 API（保存后仍需上线才生效）：\n` +
              result.map((row) => `${row.group}/${row.api} @${stageLabels[row.stage]}${row.error ? `：${row.error}` : ''}`).join('\n')}
        </Alert>
      ) : null}
    </span>
  )
}

export function ItemsSummary({ items }: { items: unknown }) {
  const list = itemsOf(items)
  if (list.length === 0) return <Muted>无</Muted>
  return (
    <>
      {list.map((item, index) => (
        <Badge key={index} tone={item.disabled ? 'red' : item.locked ? 'amber' : 'neutral'}>
          {item.disabled ? '关闭 ' : ''}{item.plugin}{item.locked ? ' 🔒' : ''}{item.stages?.length ? ` @${item.stages.map((s) => stageLabels[s]).join('/')}` : ''}
        </Badge>
      ))}
    </>
  )
}
