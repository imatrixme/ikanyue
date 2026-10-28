import { useState, type FormEvent } from 'react'

import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Controls'
import { Code, DataTable } from '../components/ui/DataTable'
import { Alert, ErrorText, Muted } from '../components/ui/Feedback'
import { PageHeader, Panel, SectionTitle } from '../components/ui/Panel'
import { deleteRecord, errorText, listRecords, type BaseRecord } from '../lib/api'
import { formatTime } from '../lib/format'
import { gateway, stageLabels, stages, type Approval, type Stage } from '../lib/gateway'
import { useResource } from '../lib/useResource'
import { StagesInput } from './GroupPages'
import { Diff } from './ReleasePage'

const roleLabels: Record<string, string> = { viewer: '只读', releaser: '上线', admin: '管理' }
const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))
const stageNames = (list: string[] | null | undefined) => (list ?? []).map((stage) => stageLabels[stage as Stage] ?? stage).join('、')

interface TokenRecord extends BaseRecord {
  name: string
  role: string
  stages: string[]
  expires: string
  lastUsed: string
  note: string
}

// TokensPage mints machine tokens for automation; a token is shown once and
// only its hash is kept, so a lost token is deleted and minted again.
export function TokensPage() {
  const tokens = useResource('admin_tokens', () => listRecords<TokenRecord>('admin_tokens', 'sort=name'))
  const [form, setForm] = useState({ name: '', role: 'viewer', stages: [] as Stage[], expires: '', note: '' })
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null)
  const [error, setError] = useState('')

  const mint = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const expires = form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : ''
      const out = await gateway.mintToken({ ...form, expires })
      setMinted({ name: out.record.name, token: out.token })
      setForm({ name: '', role: 'viewer', stages: [], expires: '', note: '' })
      tokens.reload()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  const revoke = async (row: TokenRecord) => {
    if (!window.confirm(`吊销令牌「${row.name}」？使用它的自动化会立即失去访问。`)) return
    setError('')
    try {
      await deleteRecord('admin_tokens', row.id)
      tokens.reload()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <>
      <PageHeader
        intro="给 CI 和脚本用的访问令牌，调用管理面 /gateway/v1：只读可查看状态、比对与导出配置；上线只能上线到勾选的环境；管理可应用配置。令牌不能访问数据集合，也不能再签发令牌。每次被拒都写入审计。"
        title="访问令牌"
      />
      <Panel>
        <form className="grid gap-3" onSubmit={mint}>
          <Field label="名称"><Input onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如 ci-release" required value={form.name} /></Field>
          <Field label="角色"><Select onChange={(event) => setForm({ ...form, role: event.target.value || 'viewer' })} options={roleOptions} value={form.role} /></Field>
          {form.role === 'releaser' ? (
            <Field group label="可上线环境"><StagesInput onChange={(value) => setForm({ ...form, stages: value as Stage[] })} value={form.stages} /></Field>
          ) : null}
          <Field hint="留空为永不过期；建议设置" label="过期日期"><Input onChange={(event) => setForm({ ...form, expires: event.target.value })} type="date" value={form.expires} /></Field>
          <Field label="备注"><Input onChange={(event) => setForm({ ...form, note: event.target.value })} value={form.note} /></Field>
          <div><Button type="submit" variant="primary">生成令牌</Button></div>
        </form>
      </Panel>
      {minted ? (
        <Alert tone="success">
          令牌「{minted.name}」只显示这一次，请立即保存到 CI 的密钥里：{'\n'}<Code>{minted.token}</Code>{'\n'}请求时放在 Authorization: Bearer 头中。
        </Alert>
      ) : null}
      <ErrorText error={error || tokens.error} />
      <SectionTitle>已签发</SectionTitle>
      <DataTable
        columns={[
          { label: '名称', render: (row) => row.name },
          { label: '角色', render: (row) => roleLabels[row.role] ?? row.role },
          { label: '可上线环境', render: (row) => row.role === 'admin' ? '全部' : stageNames(row.stages) || '—' },
          { label: '过期', render: (row) => row.expires ? formatTime(row.expires) : <Badge tone="amber">永不</Badge> },
          { label: '最近使用', render: (row) => formatTime(row.lastUsed) || '从未' },
          { label: '备注', render: (row) => row.note },
          { label: '操作', render: (row) => <Button onClick={() => revoke(row)} variant="ghost">吊销</Button> },
        ]}
        empty={tokens.loading ? '加载中…' : '还没有令牌'}
        rowKey={(row) => row.id}
        rows={tokens.data ?? []}
      />
    </>
  )
}

const statusBadges: Record<Approval['status'], [string, BadgeTone]> = {
  pending: ['待批准', 'amber'],
  approved: ['已批准', 'green'],
  rejected: ['已驳回', 'neutral'],
  stale: ['草稿已变', 'red'],
  expired: ['已过期', 'neutral'],
}

// ApprovalsPage shows releases to RELEASE waiting for a second identity; an
// approval releases exactly what was requested, or nothing if drafts changed.
export function ApprovalsPage() {
  const approvals = useResource('approvals', () => gateway.approvals())
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const decide = async (row: Approval, approve: boolean) => {
    if (!window.confirm(approve ? `批准并上线到${stageLabels[row.stage]}？` : '驳回这次上线申请？')) return
    setBusy(row.id)
    setResult(null)
    try {
      if (approve) {
        const out = await gateway.approve(row.id)
        setResult({ tone: 'success', text: `${stageLabels[row.stage]}已更新到 v${out.version}。` })
      } else {
        await gateway.reject(row.id)
        setResult({ tone: 'success', text: '已驳回。' })
      }
    } catch (failure) {
      setResult({ tone: 'error', text: errorText(failure) })
    } finally {
      setBusy('')
      approvals.reload()
    }
  }

  return (
    <>
      <PageHeader
        intro="网关以 GATEWAY_RELEASE_APPROVAL=1 运行时，上线生产需要另一人批准。批准时草稿必须与申请时一致，否则申请作废、需重新申请；申请 24 小时后过期。下线与回滚不需要批准。"
        title="审批"
      >
        <Button onClick={approvals.reload}>刷新</Button>
      </PageHeader>
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      <ErrorText error={approvals.error} />
      <DataTable
        columns={[
          { label: '申请时间', render: (row) => formatTime(row.created) },
          { label: '环境', render: (row) => stageLabels[row.stage] },
          { label: '申请人', render: (row) => row.requester },
          {
            label: '变更',
            render: (row) => (
              <div className="grid gap-2">
                {(row.changes ?? []).map((change) => (
                  <div key={`${change.kind}:${change.id}`}><b>{change.kind === 'group' ? '分组 ' : ''}{change.name}</b><Diff diff={change.diff} /></div>
                ))}
              </div>
            ),
          },
          {
            label: '说明',
            render: (row) => (
              <>
                {row.request.note}
                {row.request.reason ? <Muted> 原因：{row.request.reason}</Muted> : null}
                {row.request.force ? <Badge className="ml-1" tone="red">强制</Badge> : null}
              </>
            ),
          },
          {
            label: '状态',
            render: (row) => (
              <>
                <Badge tone={statusBadges[row.status][1]}>{statusBadges[row.status][0]}</Badge>
                {row.approver ? <Muted>{row.approver}</Muted> : null}
                {row.stageVersion ? <Muted> v{row.stageVersion}</Muted> : null}
                {row.error ? <div className="text-xs text-[var(--destructive)]">{row.error}</div> : null}
              </>
            ),
          },
          {
            label: '操作',
            render: (row) => row.status === 'pending' ? (
              <span className="flex gap-2">
                <Button disabled={busy === row.id} onClick={() => decide(row, true)} variant="primary">批准</Button>
                <Button disabled={busy === row.id} onClick={() => decide(row, false)} variant="ghost">驳回</Button>
              </span>
            ) : null,
          },
        ]}
        empty={approvals.loading ? '加载中…' : '没有上线申请'}
        rowKey={(row) => row.id}
        rows={approvals.data ?? []}
      />
    </>
  )
}

const stageOptions = stages.map((stage) => ({ value: stage, label: `${stageLabels[stage]}（${stage}）` }))

// ComparePage lists what two environments serve differently.
export function ComparePage() {
  const [from, setFrom] = useState<Stage>('PRE')
  const [to, setTo] = useState<Stage>('RELEASE')
  const diffs = useResource(`compare:${from}:${to}`, () => (from === to ? Promise.resolve([]) : gateway.compare(from, to)))
  const version = (value: number) => value ? `v${value}` : <Badge>未上线</Badge>
  return (
    <>
      <PageHeader intro="按正在生效的版本比对两个环境，列出不一致的分组与 API。" title="环境比对">
        <Select aria-label="比对环境" onChange={(event) => setFrom((event.target.value || 'PRE') as Stage)} options={stageOptions} value={from} />
        <Muted>对</Muted>
        <Select aria-label="被比对环境" onChange={(event) => setTo((event.target.value || 'RELEASE') as Stage)} options={stageOptions} value={to} />
      </PageHeader>
      <ErrorText error={diffs.error} />
      <DataTable
        columns={[
          { label: '对象', render: (row) => `${row.kind === 'group' ? '分组 ' : ''}${row.name}` },
          { label: stageLabels[from], render: (row) => version(row.fromVersion) },
          { label: stageLabels[to], render: (row) => version(row.toVersion) },
          { label: '差异', render: (row) => <Diff diff={row.diff} /> },
        ]}
        empty={diffs.loading ? '加载中…' : from === to ? '请选择两个不同的环境' : '两个环境一致'}
        rowKey={(row) => `${row.kind}:${row.id}`}
        rows={diffs.data ?? []}
      />
    </>
  )
}
