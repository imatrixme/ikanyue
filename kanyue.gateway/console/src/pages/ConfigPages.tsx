import { useState } from 'react'

import { OperationStatus, type Operation } from '../components/OperationPicker'
import { ItemsSummary, PolicyItems } from '../components/PolicyItems'
import { ResourcePage, type ResourceSpec } from '../components/ResourcePage'
import { Badge, YesNo } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Code, DataTable } from '../components/ui/DataTable'
import { ErrorText } from '../components/ui/Feedback'
import { SectionTitle } from '../components/ui/Panel'
import { errorText, listRecords, saveRecord, type BaseRecord } from '../lib/api'
import { timeoutFields } from '../lib/fields'
import { formatTime } from '../lib/format'
import { itemsOf } from '../lib/gateway'
import { useResource } from '../lib/useResource'


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
  intro: '服务发现是全量登记：注册心跳、DNS 与静态实例都会出现在这里。这里只调整负载均衡、健康检查与超时，对外暴露哪些接口在“API”里登记并上线。',
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
  intro: '接口发现只登记候选：服务清单里的接口出现在这里，但不会自动对外。只有登记为 API 并在某个环境上线后才经网关暴露。',
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

interface Consumer extends BaseRecord { name: string; appKey: string; fingerprint: string; enabled: boolean; policies: unknown; note: string }

const consumers: ResourceSpec<Consumer> = {
  collection: 'consumers',
  title: '应用',
  intro: 'AppKey/AppSecret 签名的调用方。AppSecret 加密保存，保存后只显示指纹。应用设置（如专属限流）只作用于该应用的请求，随 API 上线生效；私有 API 需在“授权”里授权应用。',
  query: 'sort=name&fields=id,name,appKey,fingerprint,enabled,policies,note',
  defaults: { enabled: true, policies: [] },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: 'AppKey', render: (row) => <Code>{row.appKey}</Code> },
    { label: '密钥指纹', render: (row) => <Code>{row.fingerprint}</Code> },
    { label: '应用设置', render: (row) => <ItemsSummary items={row.policies} /> },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
    { label: '备注', render: (row) => row.note },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'appKey', label: 'AppKey', kind: 'text' },
    { name: 'appSecret', label: 'AppSecret', kind: 'secret' },
    {
      name: 'policies', label: '应用设置', kind: 'custom',
      render: ({ value, onChange, recordId }) => (
        <PolicyItems impact={{ collection: 'consumers', id: recordId, field: 'policies' }} kind="application" onChange={onChange} value={itemsOf(value)} />
      ),
    },
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
  intro: '策略按名称引用这里的密钥（如 jwt-auth 的 secret）。值加密保存，不回显；改动随环境下次上线生效。',
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
