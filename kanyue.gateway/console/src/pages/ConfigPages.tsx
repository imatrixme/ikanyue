import { useState } from 'react'

import { OperationPicker, OperationStatus, type Operation } from '../components/OperationPicker'
import { ResourcePage, type ResourceSpec } from '../components/ResourcePage'
import type { FieldSpec } from '../components/RecordForm'
import { SchemaForm, type JSONSchema } from '../components/SchemaForm'
import { Badge, YesNo } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Code, DataTable } from '../components/ui/DataTable'
import { ErrorText, Muted } from '../components/ui/Feedback'
import { SectionTitle } from '../components/ui/Panel'
import { errorText, listRecords, request, saveRecord, type BaseRecord } from '../lib/api'
import { formatTime } from '../lib/format'
import { useResource } from '../lib/useResource'

const timeoutFields: FieldSpec[] = [
  { name: 'headerTimeoutMs', label: '首字节超时 ms', kind: 'number', hint: '0 使用默认值' },
  { name: 'timeoutMs', label: '整体超时 ms', kind: 'number', hint: '0 表示不限；流式接口按需设置' },
  { name: 'idleTimeoutMs', label: '空闲超时 ms', kind: 'number' },
]

interface Site extends BaseRecord { name: string; hosts: string[] }

const sites: ResourceSpec<Site> = {
  collection: 'sites',
  title: '站点',
  intro: '站点按 Host 匹配请求，路由挂在站点下。',
  query: 'sort=name',
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '域名', render: (row) => (row.hosts ?? []).map((host) => <Badge key={host}>{host}</Badge>) },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'hosts', label: '域名', kind: 'lines', hint: '每行一个，如 mapi.ikanyue.com；* 匹配任意 Host' },
  ],
}

export function SitesPage() {
  return <ResourcePage spec={sites} />
}

interface Service extends BaseRecord {
  name: string
  discovery: string
  balancer: string
  healthPath: string
  manifestHash: string
  manifestError: string
}

const discoveryOptions = [
  { value: 'registry', label: '注册心跳' },
  { value: 'dns', label: 'DNS' },
  { value: 'static', label: '静态登记' },
]

const services: ResourceSpec<Service> = {
  collection: 'services',
  title: '服务与实例',
  intro: '服务发现是全量登记：注册心跳、DNS 与静态实例都会出现在这里。这里只调整负载均衡、健康检查与超时，对外暴露哪些接口在“路由”里勾选。',
  query: 'sort=name',
  canDelete: false,
  defaults: { discovery: 'static', balancer: 'round-robin' },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '发现', render: (row) => discoveryOptions.find((option) => option.value === row.discovery)?.label ?? row.discovery },
    { label: '均衡', render: (row) => row.balancer || 'round-robin' },
    { label: '健康检查', render: (row) => row.healthPath || '—' },
    { label: '接口清单', render: (row) => row.manifestError ? <Badge tone="red">{row.manifestError}</Badge> : <Code>{(row.manifestHash || '').slice(0, 8) || '—'}</Code> },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text', hint: '注册心跳的服务由心跳自动创建' },
    { name: 'discovery', label: '发现方式', kind: 'select', options: discoveryOptions },
    { name: 'dnsName', label: 'DNS 名称', kind: 'text', visible: (v) => v.discovery === 'dns' },
    { name: 'dnsPort', label: 'DNS 端口', kind: 'number', visible: (v) => v.discovery === 'dns' },
    { name: 'dnsStage', label: 'DNS 环境', kind: 'text', visible: (v) => v.discovery === 'dns' },
    { name: 'manifestPath', label: '接口清单路径', kind: 'text', hint: '从实例拉取接口清单的路径，留空为 /internal/gateway/manifest' },
    {
      name: 'balancer', label: '负载均衡', kind: 'select',
      options: [{ value: 'round-robin', label: '加权轮询' }, { value: 'least-inflight', label: '最少在途' }, { value: 'hash', label: '一致性哈希' }],
    },
    { name: 'hashBy', label: '哈希依据', kind: 'text', hint: 'user、ip、header:<名称> 或 cookie:<名称>', visible: (v) => v.balancer === 'hash' },
    { name: 'healthPath', label: '健康检查路径', kind: 'text', hint: '如 /ready；留空不做主动检查' },
    { name: 'healthIntervalSeconds', label: '检查间隔 秒', kind: 'number' },
    { name: 'healthThreshold', label: '判定次数', kind: 'number' },
    { name: 'passiveFailures', label: '被动摘除阈值', kind: 'number', hint: '连续失败多少次临时摘除实例' },
    ...timeoutFields,
  ],
}

interface Instance extends BaseRecord {
  service: string
  address: string
  stage: string
  weight: number
  source: string
  status: 'online' | 'offline' | 'drained'
  confirmed: boolean
  lastSeen: string
  version: string
  expand?: { service?: { name: string } }
}

function InstancesTable() {
  const list = useResource('instances', () => listRecords<Instance>('instances', 'sort=service,address&expand=service'))
  const [error, setError] = useState('')
  const act = (row: Instance, body: Record<string, unknown>) => async () => {
    setError('')
    try {
      await saveRecord('instances', row.id, body)
      list.reload()
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  return (
    <>
      <SectionTitle>实例</SectionTitle>
      <ErrorText error={error || list.error} />
      <DataTable
        columns={[
          { label: '服务', render: (row) => row.expand?.service?.name },
          { label: '地址', render: (row) => <Code>{row.address}</Code> },
          { label: '环境', render: (row) => row.stage },
          { label: '权重', render: (row) => row.weight, numeric: true },
          { label: '来源', render: (row) => row.source },
          {
            label: '状态',
            render: (row) => (
              <>
                {row.status === 'online' ? <Badge tone="green">在线</Badge> : <Badge tone="red">{row.status === 'drained' ? '已摘除' : '离线'}</Badge>}
                {row.source === 'static' && !row.confirmed ? <Badge tone="amber">待确认</Badge> : null}
              </>
            ),
          },
          { label: '版本', render: (row) => row.version },
          { label: '最近心跳', render: (row) => formatTime(row.lastSeen) },
          {
            label: '操作',
            render: (row) => (
              <span className="flex gap-2">
                {row.status === 'drained'
                  ? <Button onClick={act(row, { status: row.source === 'static' ? 'online' : 'offline' })}>恢复</Button>
                  : <Button onClick={act(row, { status: 'drained' })}>摘除</Button>}
                {row.source === 'static' && !row.confirmed ? <Button onClick={act(row, { confirmed: true })}>确认</Button> : null}
              </span>
            ),
          },
        ]}
        empty={list.loading ? '加载中…' : '暂无实例'}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
      />
    </>
  )
}

export function ServicesPage() {
  return (
    <ResourcePage spec={services}>
      <InstancesTable />
    </ResourcePage>
  )
}

interface OperationRow extends Operation {
  expand?: { service?: { name: string } }
}

const operations: ResourceSpec<OperationRow> = {
  collection: 'operations',
  title: '接口',
  intro: '接口发现只登记候选：服务清单里的接口出现在这里，但不会自动对外。只有在路由里勾选的接口才经网关暴露。',
  query: 'sort=service,module,path,method&expand=service',
  columns: [
    { label: '服务', render: (row) => row.expand?.service?.name },
    { label: '方法', render: (row) => row.method || '任意' },
    { label: '路径', render: (row) => <Code>{row.path}</Code> },
    { label: '模块', render: (row) => row.module },
    { label: '鉴权', render: (row) => row.auth },
    { label: '幂等', render: (row) => <YesNo value={row.idempotent} /> },
    { label: '状态', render: (row) => <OperationStatus status={row.status} /> },
  ],
}

export function OperationsPage() {
  return <ResourcePage spec={operations} />
}

interface Route extends BaseRecord {
  name: string
  operations: string[]
  enabled: boolean
  expand?: { site?: { name: string }; service?: { name: string } }
}

const routes: ResourceSpec<Route> = {
  collection: 'routes',
  title: '路由',
  intro: '路由 = 站点 + 服务 + 勾选的接口。未勾选的接口不会经网关暴露；改动在“发布”后生效。',
  query: 'sort=name&expand=site,service',
  defaults: { enabled: true, operations: [] },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '站点', render: (row) => row.expand?.site?.name },
    { label: '服务', render: (row) => row.expand?.service?.name },
    { label: '暴露接口', render: (row) => (row.operations ?? []).length || <Badge tone="red">未选择</Badge>, numeric: true },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'site', label: '站点', kind: 'relation', collection: 'sites' },
    { name: 'service', label: '服务', kind: 'relation', collection: 'services', resets: { operations: [] } },
    {
      name: 'operations', label: '暴露的接口', kind: 'custom',
      render: ({ value, values, onChange }) => (
        <OperationPicker onChange={onChange} service={String(values.service ?? '')} value={Array.isArray(value) ? (value as string[]) : []} />
      ),
    },
    { name: 'enabled', label: '启用', kind: 'bool' },
    ...timeoutFields,
  ],
}

export function RoutesPage() {
  return <ResourcePage spec={routes} />
}

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

function PluginSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const plugins = useResource('plugins', loadPlugins)
  if (plugins.error) return <ErrorText error={plugins.error} />
  return (
    <select
      className="h-9 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">请选择</option>
      {(plugins.data ?? []).map((plugin) => <option key={plugin.name} value={plugin.name}>{plugin.name}（优先级 {plugin.priority}）</option>)}
    </select>
  )
}

function PluginConfig({ plugin, value, onChange }: { plugin: string; value: unknown; onChange: (value: unknown) => void }) {
  const plugins = useResource('plugins', loadPlugins)
  if (!plugin) return <Muted>先选择插件</Muted>
  if (plugins.error) return <ErrorText error={plugins.error} />
  const info = plugins.data?.find((item) => item.name === plugin)
  if (!info) return <Muted>{plugins.loading ? '加载中…' : `未知插件 ${plugin}`}</Muted>
  const config = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return <SchemaForm key={plugin} onChange={onChange} schema={info.schema} value={config} />
}

interface Binding extends BaseRecord {
  plugin: string
  scope: string
  config: unknown
  enabled: boolean
  expand?: { site?: { name: string }; route?: { name: string }; consumer?: { name: string } }
}

const scopeOptions = [
  { value: 'global', label: '全局' },
  { value: 'site', label: '站点' },
  { value: 'route', label: '路由' },
  { value: 'consumer', label: '消费者' },
]

const bindings: ResourceSpec<Binding> = {
  collection: 'plugin_bindings',
  title: '插件',
  intro: '挂载顺序：全局 → 站点 → 路由 → 消费者，同名插件由更具体的层级覆盖；停用的绑定会关闭继承来的同名插件。配置在发布时按插件 Schema 校验。',
  query: 'sort=scope,plugin&expand=site,route,consumer',
  defaults: { scope: 'global', enabled: true, config: {} },
  columns: [
    { label: '插件', render: (row) => row.plugin },
    { label: '层级', render: (row) => scopeOptions.find((option) => option.value === row.scope)?.label ?? row.scope },
    { label: '对象', render: (row) => row.expand?.site?.name || row.expand?.route?.name || row.expand?.consumer?.name || '全部' },
    { label: '配置', render: (row) => <Code>{JSON.stringify(row.config ?? {})}</Code> },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
  ],
  fields: [
    {
      name: 'plugin', label: '插件', kind: 'custom', resets: { config: {} },
      render: ({ value, onChange }) => <PluginSelect onChange={onChange} value={String(value ?? '')} />,
    },
    { name: 'scope', label: '层级', kind: 'select', options: scopeOptions },
    { name: 'site', label: '站点', kind: 'relation', collection: 'sites', visible: (v) => v.scope === 'site' },
    { name: 'route', label: '路由', kind: 'relation', collection: 'routes', visible: (v) => v.scope === 'route' },
    { name: 'consumer', label: '消费者', kind: 'relation', collection: 'consumers', visible: (v) => v.scope === 'consumer' },
    {
      name: 'config', label: '配置', kind: 'custom',
      render: ({ value, values, onChange }) => <PluginConfig onChange={onChange} plugin={String(values.plugin ?? '')} value={value} />,
    },
    { name: 'priority', label: '优先级', kind: 'number', hint: '0 使用插件默认优先级' },
    { name: 'enabled', label: '启用', kind: 'bool' },
    { name: 'note', label: '备注', kind: 'text' },
  ],
}

export function PluginsPage() {
  return <ResourcePage spec={bindings} />
}

interface Consumer extends BaseRecord { name: string; appKey: string; fingerprint: string; enabled: boolean; note: string }

const consumers: ResourceSpec<Consumer> = {
  collection: 'consumers',
  title: '消费者',
  intro: 'AppKey/AppSecret 签名的调用方。AppSecret 加密保存，保存后只显示指纹。',
  query: 'sort=name&fields=id,name,appKey,fingerprint,enabled,note',
  defaults: { enabled: true },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: 'AppKey', render: (row) => <Code>{row.appKey}</Code> },
    { label: '密钥指纹', render: (row) => <Code>{row.fingerprint}</Code> },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
    { label: '备注', render: (row) => row.note },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'appKey', label: 'AppKey', kind: 'text' },
    { name: 'appSecret', label: 'AppSecret', kind: 'secret' },
    { name: 'enabled', label: '启用', kind: 'bool' },
    { name: 'note', label: '备注', kind: 'text' },
  ],
}

export function ConsumersPage() {
  return <ResourcePage spec={consumers} />
}

interface Secret extends BaseRecord { name: string; fingerprint: string; note: string }

const secrets: ResourceSpec<Secret> = {
  collection: 'secrets',
  title: '密钥',
  intro: '插件配置按名称引用这里的密钥（如 jwt-auth 的 secret）。值加密保存，不回显。',
  query: 'sort=name&fields=id,name,fingerprint,note,updated',
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '指纹', render: (row) => <Code>{row.fingerprint}</Code> },
    { label: '备注', render: (row) => row.note },
    { label: '更新', render: (row) => formatTime(row.updated) },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'value', label: '值', kind: 'secret' },
    { name: 'note', label: '备注', kind: 'text' },
  ],
}

export function SecretsPage() {
  return <ResourcePage spec={secrets} />
}
