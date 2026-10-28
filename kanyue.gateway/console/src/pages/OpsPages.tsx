import { useState } from 'react'

import { ResourcePage, type ResourceSpec } from '../components/ResourcePage'
import { Badge, YesNo } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Controls'
import { Code, DataTable } from '../components/ui/DataTable'
import { Alert, ErrorText } from '../components/ui/Feedback'
import { PageHeader, Panel, SectionTitle } from '../components/ui/Panel'
import { errorText, listRecords, request, type BaseRecord } from '../lib/api'
import { formatTime, kilobytes, percent } from '../lib/format'
import { stageLabels, stages, type Stage } from '../lib/gateway'
import { totals, type Minute } from '../lib/traffic'
import { useResource } from '../lib/useResource'

interface Status {
  versions: Partial<Record<Stage, number>> | null
  onlineInstances: number
  mirrorDropped: number
  endpoints: { service: string; stage: string; address: string; healthy: boolean; inflight: number }[] | null
  signals: { Kind: string; Key: string; Since: string }[] | null
  telemetry: { dropped: number; exports: { name: string; queued: number; dropped: number; failingSince?: string; lastError?: string }[] | null } | null
}

interface Report {
  service: string
  at: string
  gauges?: Record<string, number>
  backup?: { at: string; ok: boolean; name?: string; error?: string }
}

export function OverviewPage() {
  const status = useResource('status', () => request<Status>('GET', '/gateway/v1/status'))
  const reports = useResource('reports', () => request<Report[]>('GET', '/gateway/v1/reports'))
  const services = useResource('services', () => listRecords('services', 'fields=id,name'))
  const serviceName = (id: string) => String(services.data?.find((service) => service.id === id)?.name ?? id)
  const data = status.data
  return (
    <>
      <PageHeader title="概览"><Button onClick={() => { status.reload(); reports.reload() }}>刷新</Button></PageHeader>
      <ErrorText error={status.error || reports.error} />
      {data ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="运行版本" value={stages.map((stage) => `${stageLabels[stage]} ${data.versions?.[stage] ? `v${data.versions[stage]}` : '—'}`).join(' · ')} />
          <Stat label="在线实例" value={data.onlineInstances} />
          <Stat label="日志丢弃" value={data.telemetry?.dropped ?? '—'} />
          <Stat label="镜像丢弃" value={data.mirrorDropped} />
        </div>
      ) : null}
      {data?.signals?.length ? (
        <Alert tone="error">{data.signals.map((signal) => `${signal.Kind} ${signal.Key} 自 ${formatTime(signal.Since)}`).join('\n')}</Alert>
      ) : null}
      <SectionTitle>上游健康</SectionTitle>
      <DataTable
        columns={[
          { label: '服务', render: (row) => serviceName(row.service) },
          { label: '环境', render: (row) => row.stage },
          { label: '实例', render: (row) => <Code>{row.address}</Code> },
          { label: '健康', render: (row) => row.healthy ? <Badge tone="green">健康</Badge> : <Badge tone="red">摘除</Badge> },
          { label: '在途', render: (row) => row.inflight, numeric: true },
        ]}
        rowKey={(row) => `${row.service}/${row.stage}/${row.address}`}
        rows={data?.endpoints ?? []}
      />
      <SectionTitle>服务上报与备份</SectionTitle>
      <DataTable
        columns={[
          { label: '服务', render: (row) => row.service },
          { label: '上报时间', render: (row) => formatTime(row.at) },
          { label: '指标', render: (row) => Object.entries(row.gauges ?? {}).map(([key, value]) => <Badge key={key}>{key}={value}</Badge>) },
          {
            label: '最近备份',
            render: (row) => !row.backup ? <Badge tone="red">未上报</Badge>
              : row.backup.ok ? <><Badge tone="green">成功</Badge>{formatTime(row.backup.at)}</>
                : <><Badge tone="red">失败</Badge>{row.backup.error}</>,
          },
        ]}
        rowKey={(row) => row.service}
        rows={reports.data ?? []}
      />
      {data?.telemetry?.exports?.length ? (
        <>
          <SectionTitle>日志导出</SectionTitle>
          <DataTable
            columns={[
              { label: '名称', render: (row) => row.name },
              { label: '排队', render: (row) => row.queued, numeric: true },
              { label: '丢弃', render: (row) => row.dropped, numeric: true },
              { label: '状态', render: (row) => row.failingSince ? <><Badge tone="red">失败</Badge>{row.lastError}</> : <Badge tone="green">正常</Badge> },
            ]}
            rowKey={(row) => row.name}
            rows={data.telemetry.exports}
          />
        </>
      ) : null}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel>
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </Panel>
  )
}

const ranges = [
  { value: '1', label: '最近 1 小时' },
  { value: '6', label: '最近 6 小时' },
  { value: '24', label: '最近 24 小时' },
  { value: '168', label: '最近 7 天' },
]

interface Edge { from: string; to: string; kind: string; count: number; perMinute: number; errorRatio: number; p95: number }

const edgeKinds: Record<string, string> = { route: '入口', upstream: '上游', outbound: '外部调用' }

export function TrafficPage() {
  const [hours, setHours] = useState('1')
  const traffic = useResource(`traffic:${hours}`, async () => {
    const from = Date.now() - Number(hours) * 3600_000
    const [minutes, graph] = await Promise.all([
      request<Minute[] | null>('GET', `/gateway/v1/metrics?from=${from}`),
      request<Edge[] | null>('GET', `/gateway/v1/graph?from=${from}`),
    ])
    return { routes: totals(minutes ?? []), graph: graph ?? [] }
  })
  const max = Math.max(1, ...(traffic.data?.routes ?? []).map((row) => row.count))
  return (
    <>
      <PageHeader title="流量">
        <Select aria-label="时间范围" onChange={(event) => setHours(event.target.value || '1')} options={ranges} value={hours} />
        <Button onClick={traffic.reload}>刷新</Button>
      </PageHeader>
      <ErrorText error={traffic.error} />
      <SectionTitle>API</SectionTitle>
      <DataTable
        columns={[
          { label: '环境', render: (row) => stageLabels[row.stage as Stage] ?? row.stage },
          { label: '分组', render: (row) => row.group },
          { label: 'API', render: (row) => row.route },
          { label: '请求', render: (row) => row.count, numeric: true },
          {
            label: '占比',
            render: (row) => <span className="inline-block h-2 rounded bg-[var(--primary)]" style={{ width: `${Math.round((120 * row.count) / max)}px` }} />,
          },
          { label: '4xx', render: (row) => row.s4xx, numeric: true },
          { label: '失败率', render: (row) => row.failures ? <Badge tone="red">{percent(row.failures / row.count)}</Badge> : '0%', numeric: true },
          { label: '最差分钟 P95 ms', render: (row) => row.worstP95.toFixed(0), numeric: true },
          { label: '出流量', render: (row) => kilobytes(row.bytesOut), numeric: true },
        ]}
        empty={traffic.loading ? '加载中…' : '该时间段没有流量'}
        rowKey={(row) => `${row.stage}/${row.group}/${row.route}`}
        rows={traffic.data?.routes ?? []}
      />
      <SectionTitle>依赖关系</SectionTitle>
      <DataTable
        columns={[
          { label: '来源', render: (row) => row.from },
          { label: '去向', render: (row) => row.to },
          { label: '类型', render: (row) => edgeKinds[row.kind] ?? row.kind },
          { label: '每分钟', render: (row) => row.perMinute.toFixed(1), numeric: true },
          { label: '错误率', render: (row) => row.errorRatio ? <Badge tone="red">{percent(row.errorRatio)}</Badge> : '0%', numeric: true },
          { label: 'P95 ms', render: (row) => row.p95.toFixed(0), numeric: true },
        ]}
        rowKey={(row) => `${row.kind}:${row.from}>${row.to}`}
        rows={traffic.data?.graph ?? []}
      />
    </>
  )
}

interface LogRecord {
  id: number
  time: string
  method?: string
  path?: string
  status?: number
  durationMs?: number
  stage?: string
  group?: string
  route?: string
  instance?: string
  clientIp?: string
  consumer?: string
  error?: string
  requestId?: string
}

const logFilters = [
  { key: 'stage', label: '环境 TEST/PRE/RELEASE' },
  { key: 'group', label: '分组' },
  { key: 'route', label: 'API' },
  { key: 'path', label: '路径前缀' },
  { key: 'requestId', label: '请求 ID' },
  { key: 'consumer', label: '消费者' },
  { key: 'minStatus', label: '最小状态码' },
] as const

type LogFilter = Record<(typeof logFilters)[number]['key'], string>

export function LogsPage() {
  const [draft, setDraft] = useState<LogFilter>({ stage: '', group: '', route: '', path: '', requestId: '', consumer: '', minStatus: '' })
  const [filter, setFilter] = useState(draft)
  const [older, setOlder] = useState<LogRecord[]>([])
  const [error, setError] = useState('')
  const query = (before?: number) => {
    const params = new URLSearchParams({ from: String(Date.now() - 7 * 86400_000), limit: '100' })
    for (const { key } of logFilters) if (filter[key]) params.set(key, filter[key])
    if (before) params.set('before', String(before))
    return request<LogRecord[] | null>('GET', `/gateway/v1/logs?${params}`).then((rows) => rows ?? [])
  }
  const logs = useResource(`logs:${JSON.stringify(filter)}`, () => query())
  const rows = [...(logs.data ?? []), ...older]

  const more = async () => {
    setError('')
    try {
      const next = await query(rows[rows.length - 1]?.id)
      setOlder((prev) => [...prev, ...next])
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <>
      <PageHeader intro="错误与慢请求全量保留，成功请求按比例采样；不记录请求头、Cookie、查询串与请求体，路径中的手机号、邮箱、身份证号已脱敏。" title="日志" />
      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setOlder([])
          setFilter(draft)
        }}
      >
        {logFilters.map(({ key, label }) => (
          <Input aria-label={label} className="w-36" key={key} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} placeholder={label} value={draft[key]} />
        ))}
        <Button type="submit" variant="primary">查询</Button>
      </form>
      <ErrorText error={error || logs.error} />
      <DataTable
        columns={[
          { label: '时间', render: (row) => formatTime(row.time) },
          { label: '方法', render: (row) => row.method },
          { label: '路径', render: (row) => <Code>{row.path}</Code> },
          { label: '状态', render: (row) => !row.status || row.status >= 500 ? <Badge tone="red">{row.status || '—'}</Badge> : row.status },
          { label: '耗时 ms', render: (row) => (row.durationMs ?? 0).toFixed(1), numeric: true },
          { label: '环境', render: (row) => stageLabels[row.stage as Stage] ?? row.stage },
          { label: 'API', render: (row) => row.group ? `${row.group}/${row.route ?? ''}` : row.route },
          { label: '实例', render: (row) => row.instance },
          { label: '客户端', render: (row) => row.clientIp },
          { label: '消费者', render: (row) => row.consumer },
          { label: '原因', render: (row) => row.error },
          { label: '请求 ID', render: (row) => <Code>{row.requestId}</Code> },
        ]}
        empty={logs.loading ? '加载中…' : '没有符合条件的日志'}
        rowKey={(row) => String(row.id)}
        rows={rows}
      />
      {rows.length >= 100 ? <Button className="mt-3" onClick={more}>加载更早的日志</Button> : null}
    </>
  )
}

const templates = [
  { value: '5xx-ratio', label: '5xx 比例（阈值如 0.05）' },
  { value: 'p95-latency', label: 'P95 延迟 ms' },
  { value: 'no-healthy-instance', label: '上游没有健康实例' },
  { value: 'breaker-open', label: '熔断打开' },
  { value: 'outbound-failures', label: '外部调用失败次数（对象默认 payment-callback）' },
  { value: 'outbox-dead-letters', label: 'outbox 死信积压' },
  { value: 'dropped-logs', label: '日志或镜像丢弃数' },
  { value: 'export-failing', label: '日志导出失败' },
  { value: 'backup-overdue', label: '备份超时（小时，默认 26）' },
  { value: 'certificate-expiry', label: '证书即将过期（天，对象填证书文件路径）' },
  { value: 'operation-removed', label: 'API 登记的接口已从清单移除' },
]

interface Rule extends BaseRecord { name: string; template: string; target: string; threshold: number; forMinutes: number; enabled: boolean }

const rules: ResourceSpec<Rule> = {
  collection: 'alert_rules',
  title: '告警规则',
  intro: '每分钟评估一次；条件持续“持续分钟”后告警，条件消失后发送恢复通知。',
  query: 'sort=name',
  defaults: { enabled: true },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '模板', render: (row) => templates.find((item) => item.value === row.template)?.label ?? row.template },
    { label: '对象', render: (row) => row.target || '全部' },
    { label: '阈值', render: (row) => row.threshold || '默认', numeric: true },
    { label: '持续', render: (row) => `${row.forMinutes || 0} 分钟` },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'template', label: '模板', kind: 'select', options: templates },
    { name: 'target', label: '对象', kind: 'text', hint: 'API（分组/名称，非生产加 @环境）、服务名、外部依赖名或证书文件路径；留空表示全部' },
    { name: 'threshold', label: '阈值', kind: 'number', hint: '0 使用模板默认值' },
    { name: 'forMinutes', label: '持续分钟', kind: 'number' },
    { name: 'channels', label: '通知渠道', kind: 'relations', collection: 'alert_channels' },
    { name: 'enabled', label: '启用', kind: 'bool' },
  ],
}

interface Channel extends BaseRecord { name: string; kind: string; url: string; fingerprint: string; enabled: boolean }

const channelKinds = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'wecom', label: '企业微信' },
  { value: 'feishu', label: '飞书' },
  { value: 'dingtalk', label: '钉钉' },
]

const channels: ResourceSpec<Channel> = {
  collection: 'alert_channels',
  title: '告警渠道',
  intro: 'Webhook 带 X-Kanyue-Timestamp 与 X-Kanyue-Signature（sha256=HMAC(密钥, 时间戳 + "." + 正文)）；企业微信、飞书、钉钉使用各自的机器人消息格式。',
  query: 'sort=name&fields=id,name,kind,url,fingerprint,enabled',
  defaults: { kind: 'webhook', enabled: true },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '类型', render: (row) => channelKinds.find((item) => item.value === row.kind)?.label ?? row.kind },
    { label: '密钥指纹', render: (row) => <Code>{row.fingerprint}</Code> },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'kind', label: '类型', kind: 'select', options: channelKinds },
    { name: 'url', label: '地址', kind: 'text' },
    { name: 'secret', label: '签名密钥', kind: 'secret', visible: (v) => v.kind === 'webhook' },
    { name: 'enabled', label: '启用', kind: 'bool' },
  ],
}

interface AlertEvent { id: number; time: string; message: string }

function RecentAlerts() {
  const events = useResource('alert-events', () => request<AlertEvent[] | null>('GET', '/gateway/v1/events?kind=alert&limit=50'))
  return (
    <>
      <SectionTitle>最近告警</SectionTitle>
      <ErrorText error={events.error} />
      <DataTable
        columns={[
          { label: '时间', render: (row) => formatTime(row.time) },
          { label: '内容', render: (row) => <span className="whitespace-pre-wrap">{row.message}</span> },
        ]}
        rowKey={(row) => String(row.id)}
        rows={events.data ?? []}
      />
    </>
  )
}

export function AlertRulesPage() {
  return (
    <ResourcePage spec={rules}>
      <RecentAlerts />
    </ResourcePage>
  )
}

export function AlertChannelsPage() {
  return <ResourcePage spec={channels} />
}

interface Exporter extends BaseRecord {
  name: string
  url: string
  auth: string
  sample: number
  enabled: boolean
  probedAt: string
  probeError: string
}

function ProbeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const out = await request<{ ok: boolean; error?: string }>('POST', `/gateway/v1/exporters/${id}/probe`)
          window.alert(out.ok ? '连接测试通过' : `连接测试失败：${out.error}`)
        } catch (failure) {
          window.alert(`连接测试失败：${errorText(failure)}`)
        } finally {
          setBusy(false)
          onDone()
        }
      }}
    >
      测试
    </Button>
  )
}

const exporters: ResourceSpec<Exporter> = {
  collection: 'exporters',
  title: '日志导出',
  intro: 'JSON lines over HTTP，例如同机 VictoriaLogs：http://127.0.0.1:9428/insert/jsonline。启用前会自动测试连接，失败则不能启用。',
  query: 'sort=name&fields=id,name,url,auth,username,fingerprint,streamFields,sample,onlyErrors,enabled,probedAt,probeError',
  defaults: { auth: 'none', sample: 1 },
  columns: [
    { label: '名称', render: (row) => row.name },
    { label: '地址', render: (row) => <Code>{row.url}</Code> },
    { label: '认证', render: (row) => row.auth || 'none' },
    { label: '采样', render: (row) => row.sample || 1, numeric: true },
    { label: '启用', render: (row) => <YesNo value={row.enabled} /> },
    {
      label: '最近测试',
      render: (row) => row.probeError ? <Badge tone="red">{row.probeError}</Badge> : row.probedAt ? <Badge tone="green">通过 {formatTime(row.probedAt)}</Badge> : '',
    },
  ],
  fields: [
    { name: 'name', label: '名称', kind: 'text' },
    { name: 'url', label: '地址', kind: 'text' },
    {
      name: 'auth', label: '认证', kind: 'select',
      options: [{ value: 'none', label: '无' }, { value: 'basic', label: 'Basic' }, { value: 'bearer', label: 'Bearer 令牌' }],
    },
    { name: 'username', label: '用户名', kind: 'text', visible: (v) => v.auth === 'basic' },
    { name: 'secret', label: '密码或令牌', kind: 'secret', visible: (v) => v.auth === 'basic' || v.auth === 'bearer' },
    { name: 'streamFields', label: 'Stream 字段', kind: 'text', hint: '逗号分隔，如 stage,group,service' },
    { name: 'sample', label: '成功请求采样', kind: 'number', hint: '0–1，0 视为 1；错误与事件总是导出' },
    { name: 'onlyErrors', label: '只导出错误', kind: 'bool' },
    { name: 'enabled', label: '启用', kind: 'bool' },
  ],
  actions: (row, reload) => <ProbeButton id={row.id} onDone={reload} />,
}

export function ExportersPage() {
  return <ResourcePage spec={exporters} />
}

interface AuditLog extends BaseRecord {
  actor: string
  action: string
  resource: string
  resourceId: string
  detail: unknown
  diff: Record<string, { before?: unknown; after?: unknown }> | null
}

function AuditDetail({ row }: { row: AuditLog }) {
  const diff = Object.entries(row.diff ?? {})
  if (diff.length === 0) return <Code>{JSON.stringify(row.detail ?? {}).slice(0, 300)}</Code>
  return (
    <ul className="grid gap-1">
      {diff.map(([field, change]) => (
        <li key={field}><Code>{field}</Code>：<Code>{JSON.stringify(change.before ?? null).slice(0, 200)}</Code> → <Code>{JSON.stringify(change.after ?? null).slice(0, 200)}</Code></li>
      ))}
    </ul>
  )
}

const audit: ResourceSpec<AuditLog> = {
  collection: 'audit_logs',
  title: '审计',
  intro: '草稿改动（含改前改后差异；密钥只记录指纹）、上线、下线、回滚与迁移的记录。只能追加，不能修改或删除。',
  query: 'sort=-created&fields=id,created,actor,action,resource,resourceId,detail,diff',
  columns: [
    { label: '时间', render: (row) => formatTime(row.created) },
    { label: '操作人', render: (row) => row.actor || '系统' },
    { label: '动作', render: (row) => row.action },
    { label: '对象', render: (row) => `${row.resource} ${row.resourceId}` },
    { label: '明细', render: (row) => <AuditDetail row={row} /> },
  ],
}

export function AuditPage() {
  return <ResourcePage spec={audit} />
}
