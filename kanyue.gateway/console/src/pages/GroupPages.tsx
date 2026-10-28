import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { OperationPicker, OperationStatus, type Operation } from '../components/OperationPicker'
import { ItemsSummary, PolicyItems } from '../components/PolicyItems'
import type { FieldSpec } from '../components/RecordForm'
import { ResourcePage, type ResourceSpec } from '../components/ResourcePage'
import { StageStates } from '../components/StageStates'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Checkbox, Field, Select } from '../components/ui/Controls'
import { Code, DataTable } from '../components/ui/DataTable'
import { Alert, ErrorText, Muted } from '../components/ui/Feedback'
import { Panel, SectionTitle } from '../components/ui/Panel'
import { errorText, listRecords, saveRecord, type BaseRecord } from '../lib/api'
import { timeoutFields } from '../lib/fields'
import { apiName, gateway, itemsOf, layerLabels, stageLabels, stages, type Effective, type Stage, targetKey } from '../lib/gateway'
import { useResource } from '../lib/useResource'
import { History, type ReleaseRecord } from './ReleasePage'


const stageOptions = stages.map((stage) => ({ value: stage, label: `${stageLabels[stage]}（${stage}）` }))

function useStates() {
  return useResource('states', () => gateway.states())
}

// releaseLink opens the release page with the targets ticked.
function useReleaseLink() {
  const navigate = useNavigate()
  return (keys: string[]) => navigate(`/release?select=${encodeURIComponent(keys.join(','))}`)
}

interface Domain extends BaseRecord { host: string; fixedStage: string; expand?: { group?: { name: string } } }

interface Group extends BaseRecord {
  name: string
  note: string
  expand?: { defaultPolicySet?: { name: string }; group_domains_via_group?: Domain[] }
}

export function GroupsPage() {
  const states = useStates()
  const release = useReleaseLink()
  const groups: ResourceSpec<Group> = {
    collection: 'api_groups',
    title: 'API 分组',
    intro: 'API 归集到分组，分组绑定域名并默认挂一个策略组。这里改的都是草稿：域名与 API 在某个环境点击“上线”后才在该环境生效，未上线的环境继续用旧配置。',
    query: 'sort=name&expand=defaultPolicySet,group_domains_via_group',
    columns: [
      { label: '名称', render: (row) => row.name },
      {
        label: '域名',
        render: (row) => (row.expand?.group_domains_via_group ?? []).map((d) => (
          <Badge key={d.id} tone={d.fixedStage ? 'blue' : 'neutral'}>{d.host}{d.fixedStage ? ` → ${stageLabels[d.fixedStage as Stage]}` : ''}</Badge>
        )),
      },
      { label: '默认策略组', render: (row) => row.expand?.defaultPolicySet?.name ?? <Muted>无</Muted> },
      { label: '各环境', render: (row) => <StageStates states={states.data} target={{ kind: 'group', id: row.id }} /> },
      { label: '备注', render: (row) => row.note },
    ],
    fields: [
      { name: 'name', label: '名称', kind: 'text', hint: '小写字母、数字、点、横线与下划线' },
      { name: 'defaultPolicySet', label: '默认策略组', kind: 'relation', collection: 'policy_sets', hint: '组内 API 默认继承；策略组之间不组合' },
      { name: 'note', label: '备注', kind: 'text' },
    ],
    actions: (row) => <Button onClick={() => release([targetKey({ kind: 'group', id: row.id })])}>上线…</Button>,
  }
  const domainSpec: ResourceSpec<Domain> = {
    collection: 'group_domains',
    title: '域名',
    intro: '一个域名只属于一个分组；“*”匹配其他所有 Host。请求按“固定环境的域名 → X-Ca-Stage 请求头 → 生产”决定环境；固定到某环境的域名只在该环境生效。',
    query: 'sort=host&expand=group',
    columns: [
      { label: '域名', render: (row) => <Code>{row.host}</Code> },
      { label: '分组', render: (row) => row.expand?.group?.name },
      { label: '固定环境', render: (row) => row.fixedStage ? stageLabels[row.fixedStage as Stage] : <Muted>按请求头</Muted> },
    ],
    fields: [
      { name: 'group', label: '分组', kind: 'relation', collection: 'api_groups' },
      { name: 'host', label: '域名', kind: 'text', hint: '如 mapi.ikanyue.com；* 匹配任意 Host' },
      { name: 'fixedStage', label: '固定环境', kind: 'select', options: stageOptions, hint: '留空则由 X-Ca-Stage 决定，默认生产' },
    ],
  }
  return (
    <ResourcePage spec={groups}>
      <ErrorText error={states.error} />
      <div className="mt-8">
        <ResourcePage spec={domainSpec} />
      </div>
    </ResourcePage>
  )
}

interface API extends BaseRecord {
  name: string
  group: string
  visibility: 'public' | 'private'
  auth: string
  priority: number
  overrides: unknown
  note: string
  expand?: { group?: { name: string }; operation?: Operation & { expand?: { service?: { name: string } } }; policySet?: { name: string } }
}

const authOptions = [
  { value: 'passthrough', label: '透传（由上游服务鉴权）' },
  { value: 'none', label: '无需鉴权' },
  { value: 'signature', label: '应用签名（AppKey/AppSecret）' },
  { value: 'jwt', label: 'JWT（需在策略组或覆盖里配置 jwt-auth 密钥）' },
]

const visibilityOptions = [
  { value: 'public', label: '公开' },
  { value: 'private', label: '私有（仅授权的应用，需应用签名）' },
]

interface OperationRow extends Operation { expand?: { service?: { name: string } } }

function OperationSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ops = useResource('operations:all', () => listRecords<OperationRow>('operations', 'sort=service,path,method&expand=service'))
  if (ops.error) return <ErrorText error={ops.error} />
  const options = (ops.data ?? [])
    .filter((op) => op.status !== 'removed' || op.id === value)
    .map((op) => ({ value: op.id, label: `${op.expand?.service?.name ?? op.service} · ${op.method || '任意'} ${op.path}${op.status === 'removed' ? '（已移除）' : ''}` }))
  return <Select onChange={(event) => onChange(event.target.value)} options={options} value={value} />
}

const apiFields: FieldSpec[] = [
  { name: 'group', label: '分组', kind: 'relation', collection: 'api_groups' },
  { name: 'name', label: '名称', kind: 'text', hint: '组内唯一；登记时按方法与路径生成' },
  {
    name: 'operation', label: '服务接口', kind: 'custom',
    render: ({ value, onChange }) => <OperationSelect onChange={onChange} value={String(value ?? '')} />,
  },
  { name: 'visibility', label: '可见性', kind: 'select', options: visibilityOptions },
  { name: 'auth', label: '鉴权', kind: 'select', options: authOptions },
  { name: 'policySet', label: 'API 策略组', kind: 'relation', collection: 'policy_sets', hint: '留空则只用分组的默认策略组' },
  {
    name: 'overrides', label: 'API 覆盖', kind: 'custom',
    render: ({ value, onChange, recordId }) => (
      <PolicyItems impact={{ collection: 'apis', id: recordId, field: 'overrides' }} kind="override" onChange={onChange} value={itemsOf(value)} />
    ),
  },
  { name: 'priority', label: '路由优先级', kind: 'number', hint: '同一域名下数值大的先匹配（-1000～1000），同级按路径精确度' },
  ...timeoutFields,
  { name: 'note', label: '备注', kind: 'text' },
]

export function ApisPage() {
  const states = useStates()
  const release = useReleaseLink()
  const [inspecting, setInspecting] = useState<API | null>(null)
  const [registering, setRegistering] = useState(false)
  const spec: ResourceSpec<API> = {
    collection: 'apis',
    title: 'API',
    intro: 'API = 分组里登记的一个服务接口，可单独设置可见性、鉴权、策略组与覆盖。登记和修改都是草稿，需在各环境上线；服务清单新发现的接口不会自动登记。',
    query: 'sort=group,name&expand=group,operation,operation.service,policySet',
    defaults: { visibility: 'public', auth: 'passthrough', overrides: [] },
    columns: [
      { label: '分组', render: (row) => row.expand?.group?.name },
      { label: '名称', render: (row) => row.name },
      {
        label: '接口',
        render: (row) => {
          const op = row.expand?.operation
          return op ? <><Code>{`${op.method || '任意'} ${op.path}`}</Code> {op.status === 'removed' ? <OperationStatus status="removed" /> : null}</> : <Badge tone="red">已删除</Badge>
        },
      },
      { label: '鉴权', render: (row) => <>{row.visibility === 'private' ? <Badge tone="blue">私有</Badge> : null}{row.auth}</> },
      { label: '策略', render: (row) => <>{row.expand?.policySet ? <Badge>{row.expand.policySet.name}</Badge> : null}<ItemsSummary items={row.overrides} /></> },
      { label: '各环境', render: (row) => <StageStates states={states.data} target={{ kind: 'api', id: row.id }} /> },
    ],
    fields: apiFields,
    actions: (row) => (
      <>
        <Button onClick={() => setInspecting(row)}>生效策略</Button>
        <Button onClick={() => release([targetKey({ kind: 'api', id: row.id })])}>上线…</Button>
      </>
    ),
  }
  return (
    <>
      {registering ? <RegisterAPIs onDone={() => setRegistering(false)} /> : <Button className="mb-3" onClick={() => setRegistering(true)}>从服务批量登记</Button>}
      {inspecting ? <EffectivePanel api={inspecting} onClose={() => setInspecting(null)} /> : null}
      <ResourcePage spec={spec}>
        <ErrorText error={states.error} />
      </ResourcePage>
    </>
  )
}

// RegisterAPIs drafts an API per ticked operation in a group; nothing is preselected.
function RegisterAPIs({ onDone }: { onDone: () => void }) {
  const groups = useResource('api_groups', () => listRecords('api_groups', 'fields=id,name&sort=name'))
  const services = useResource('services', () => listRecords('services', 'fields=id,name&sort=name'))
  const [group, setGroup] = useState('')
  const [service, setService] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [visibility, setVisibility] = useState('public')
  const [auth, setAuth] = useState('passthrough')
  const [result, setResult] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const register = async () => {
    setBusy(true)
    setResult(null)
    const failures: string[] = []
    try {
      const [ops, existing] = await Promise.all([
        listRecords<Operation>('operations', `filter=${encodeURIComponent(`service="${service}"`)}`),
        listRecords<API>('apis', `filter=${encodeURIComponent(`group="${group}"`)}&fields=id,name,operation`),
      ])
      const names = new Set(existing.map((api) => api.name))
      const taken = new Set(existing.map((api) => String(api.operation)))
      let added = 0
      for (const op of ops.filter((op) => picked.includes(op.id) && !taken.has(op.id))) {
        let name = apiName(op.method, op.path)
        for (let i = 2; names.has(name); i++) name = `${apiName(op.method, op.path)}-${i}`
        names.add(name)
        try {
          await saveRecord('apis', undefined, { group, operation: op.id, name, visibility, auth, overrides: [] })
          added++
        } catch (failure) {
          failures.push(`${op.method} ${op.path}：${errorText(failure)}`)
        }
      }
      setResult(failures.length
        ? { tone: 'error', text: [`登记了 ${added} 个，失败 ${failures.length} 个：`, ...failures].join('\n') }
        : { tone: 'success', text: `登记了 ${added} 个 API 草稿；已登记的接口跳过。刷新列表后到“发布”页上线。` })
    } catch (failure) {
      setResult({ tone: 'error', text: errorText(failure) })
    } finally {
      setBusy(false)
    }
  }

  const toOptions = (rows: BaseRecord[] | undefined) => (rows ?? []).map((row) => ({ value: row.id, label: String(row.name) }))
  return (
    <Panel className="mb-4 grid gap-3">
      <h2 className="text-sm font-semibold">从服务批量登记 API</h2>
      <ErrorText error={groups.error || services.error} />
      <Field label="分组"><Select onChange={(event) => setGroup(event.target.value)} options={toOptions(groups.data)} value={group} /></Field>
      <Field label="服务"><Select onChange={(event) => { setService(event.target.value); setPicked([]) }} options={toOptions(services.data)} value={service} /></Field>
      <Field label="可见性"><Select onChange={(event) => setVisibility(event.target.value)} options={visibilityOptions} value={visibility} /></Field>
      <Field label="鉴权"><Select onChange={(event) => setAuth(event.target.value)} options={authOptions} value={auth} /></Field>
      <Field group label="接口"><OperationPicker onChange={setPicked} service={service} value={picked} /></Field>
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      <div className="flex gap-2">
        <Button disabled={busy || !group || picked.length === 0} onClick={register} variant="primary">登记为草稿</Button>
        <Button onClick={onDone}>关闭</Button>
      </div>
    </Panel>
  )
}

function EffectiveTable({ rows }: { rows: Effective[] }) {
  return (
    <DataTable
      columns={[
        { label: '插件', render: (row) => <>{row.plugin}{row.locked ? <Badge className="ml-1" tone="amber">锁定</Badge> : null}</> },
        { label: '来源', render: (row) => `${layerLabels[row.layer] ?? row.layer}${row.source ? ` ${row.source}` : ''}` },
        { label: '配置', render: (row) => <Code>{JSON.stringify(row.config ?? {})}</Code> },
        { label: '优先级', render: (row) => row.priority || '默认', numeric: true },
      ]}
      empty="无"
      rowKey={(row, index) => `${row.plugin}#${index}`}
      rows={rows}
    />
  )
}

function EffectivePanel({ api, onClose }: { api: API; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('RELEASE')
  const view = useResource(`effective:${api.id}:${stage}`, () => gateway.effective(api.id, stage))
  const history = useResource(`releases:${api.id}:${stage}`, () =>
    listRecords<ReleaseRecord>('releases', `sort=-created&filter=${encodeURIComponent(`stage="${stage}" && kind="api" && target="${api.id}"`)}`))
  const data = view.data
  return (
    <Panel className="mb-4 grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{api.name} 的生效策略</h2>
        <span className="flex gap-2">
          <Select aria-label="环境" onChange={(event) => setStage((event.target.value || 'RELEASE') as Stage)} options={stageOptions} value={stage} />
          <Button onClick={onClose}>关闭</Button>
        </span>
      </div>
      <ErrorText error={view.error || data?.error || ''} />
      <Muted>合并顺序：平台基线 → 分组策略组 → API 策略组 → API 覆盖 → 鉴权；应用设置只作用于该应用的请求。</Muted>
      <SectionTitle>草稿（上线后的样子）</SectionTitle>
      <EffectiveTable rows={data?.draft ?? []} />
      <SectionTitle>{data?.served ? `${stageLabels[stage]}正在生效（v${data.version}）` : `${stageLabels[stage]}未上线`}</SectionTitle>
      {data?.served ? <EffectiveTable rows={data.served.policies ?? []} /> : null}
      <ErrorText error={history.error} />
      <History history={history.data ?? []} onDone={() => { view.reload(); history.reload() }} stage={stage} />
    </Panel>
  )
}

interface PolicySet extends BaseRecord { name: string; items: unknown; note: string }

export function PolicySetsPage() {
  const refs = useResource('policy-set-refs', async () => {
    const [groups, apis] = await Promise.all([
      listRecords('api_groups', 'fields=id,defaultPolicySet'),
      listRecords('apis', 'fields=id,policySet'),
    ])
    const count = new Map<string, number>()
    for (const id of [...groups.map((g) => g.defaultPolicySet), ...apis.map((a) => a.policySet)]) {
      if (id) count.set(String(id), (count.get(String(id)) ?? 0) + 1)
    }
    return count
  })
  const references = (row: PolicySet) => {
    if (row.name === 'baseline') return <Badge tone="blue">全部 API</Badge>
    const n = refs.data?.get(row.id) ?? 0
    if (n === 0) return <Badge tone="amber">未被引用，可删除</Badge>
    if (n === 1) return <Badge tone="amber">仅 1 处引用，可考虑改为 API 覆盖</Badge>
    return `${n} 处`
  }
  const spec: ResourceSpec<PolicySet> = {
    collection: 'policy_sets',
    title: '策略组',
    intro: 'baseline 是平台基线，作用于所有 API。分组默认挂一个策略组，API 可另挂一个策略组并在“API 覆盖”里调整；策略组之间不组合。锁定的策略下层不能修改或关闭。修改策略组不会立即生效，受影响的 API 需重新上线。',
    query: 'sort=name',
    defaults: { items: [] },
    columns: [
      { label: '名称', render: (row) => row.name === 'baseline' ? <><Badge tone="blue">平台基线</Badge>{row.name}</> : row.name },
      { label: '策略', render: (row) => <ItemsSummary items={row.items} /> },
      { label: '引用', render: references },
      { label: '备注', render: (row) => row.note },
    ],
    fields: [
      { name: 'name', label: '名称', kind: 'text' },
      {
        name: 'items', label: '策略', kind: 'custom',
        render: ({ value, onChange, recordId }) => (
          <PolicyItems impact={{ collection: 'policy_sets', id: recordId, field: 'items' }} kind="set" onChange={onChange} value={itemsOf(value)} />
        ),
      },
      { name: 'note', label: '备注', kind: 'text' },
    ],
  }
  return (
    <ResourcePage spec={spec}>
      <ErrorText error={refs.error} />
    </ResourcePage>
  )
}

interface Grant extends BaseRecord {
  stages: string[]
  note: string
  expand?: { consumer?: { name: string }; group?: { name: string }; api?: { name: string } }
}

export function StagesInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return (
    <span className="flex flex-wrap gap-3">
      {stages.map((stage) => (
        <Checkbox
          checked={value.includes(stage)}
          key={stage}
          label={stageLabels[stage]}
          onChange={(event) => onChange(event.target.checked ? [...value, stage] : value.filter((s) => s !== stage))}
        />
      ))}
    </span>
  )
}

export function GrantsPage() {
  const spec: ResourceSpec<Grant> = {
    collection: 'grants',
    title: '授权',
    intro: '私有 API 只允许被授权的应用调用。授权给分组即授权组内所有 API；授权在相关 API 重新上线后生效。',
    query: 'sort=consumer&expand=consumer,group,api',
    defaults: { stages: [] },
    columns: [
      { label: '应用', render: (row) => row.expand?.consumer?.name },
      { label: '对象', render: (row) => row.expand?.api ? `API ${row.expand.api.name}` : `分组 ${row.expand?.group?.name ?? ''}` },
      { label: '环境', render: (row) => row.stages?.length ? row.stages.map((s) => stageLabels[s as Stage]).join('、') : '全部' },
      { label: '备注', render: (row) => row.note },
    ],
    fields: [
      { name: 'consumer', label: '应用', kind: 'relation', collection: 'consumers' },
      { name: 'group', label: '分组', kind: 'relation', collection: 'api_groups', hint: '分组与 API 二选一' },
      { name: 'api', label: 'API', kind: 'relation', collection: 'apis' },
      {
        name: 'stages', label: '环境', kind: 'custom',
        render: ({ value, onChange }) => <StagesInput onChange={onChange} value={Array.isArray(value) ? (value as string[]) : []} />,
      },
      { name: 'note', label: '备注', kind: 'text' },
    ],
  }
  return <ResourcePage spec={spec} />
}
