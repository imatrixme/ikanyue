import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { StageStates } from '../components/StageStates'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Checkbox, Input, Select } from '../components/ui/Controls'
import { Code, DataTable } from '../components/ui/DataTable'
import { Alert, ErrorText, Muted } from '../components/ui/Feedback'
import { PageHeader, Panel, SectionTitle } from '../components/ui/Panel'
import { ApiError, errorText, listRecords, type BaseRecord } from '../lib/api'
import { formatTime } from '../lib/format'
import {
  gateway, parseTarget, stageLabels, stages, targetKey,
  type Change, type Preview, type ReleaseRequest, type ReleaseResult, type Released, type Stage, type Target,
} from '../lib/gateway'
import { useResource } from '../lib/useResource'

interface Candidate { target: Target; name: string; group: string }

async function loadCandidates(): Promise<Candidate[]> {
  const [groups, apis] = await Promise.all([
    listRecords('api_groups', 'fields=id,name&sort=name'),
    listRecords('apis', 'fields=id,name,group&sort=group,name'),
  ])
  const groupName = (id: unknown) => String(groups.find((group) => group.id === id)?.name ?? '')
  return [
    ...groups.map((group) => ({ target: { kind: 'group' as const, id: group.id }, name: `分组 ${String(group.name)}（域名与默认策略组）`, group: String(group.name) })),
    ...apis.map((api) => ({ target: { kind: 'api' as const, id: api.id }, name: String(api.name), group: groupName(api.group) })),
  ]
}

function Diff({ diff }: { diff?: Record<string, Change> | null }) {
  const entries = Object.entries(diff ?? {})
  if (entries.length === 0) return <Muted>无差异</Muted>
  return (
    <ul className="grid gap-1">
      {entries.map(([field, change]) => (
        <li key={field}>
          <Code>{field}</Code>：<Code>{JSON.stringify(change.before ?? null)}</Code> → <Code>{JSON.stringify(change.after ?? null)}</Code>
        </li>
      ))}
    </ul>
  )
}

const stageOptions = stages.map((stage) => ({ value: stage, label: `${stageLabels[stage]}（${stage}）` }))

export function ReleasePage() {
  const [params] = useSearchParams()
  const [stage, setStage] = useState<Stage>('TEST')
  const [selected, setSelected] = useState<Set<string>>(() => new Set((params.get('select') ?? '').split(',').filter((key) => parseTarget(key))))
  const [onlyPending, setOnlyPending] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview[] | null>(null)
  const [promotion, setPromotion] = useState<Released[] | null>(null)
  const [result, setResult] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const candidates = useResource('release-candidates', loadCandidates)
  const states = useResource('states', () => gateway.states())
  const history = useResource(`releases:${stage}`, () => listRecords<ReleaseRecord>('releases', `sort=-created&filter=${encodeURIComponent(`stage="${stage}"`)}`))

  const targets = [...selected].map(parseTarget).filter((target): target is Target => target !== null)
  const request = (): ReleaseRequest => ({ stage, targets, note, reason, force })
  const pending = (candidate: Candidate) => {
    const status = states.data?.[targetKey(candidate.target)]?.[stage]?.status
    return status !== 'current' && status !== 'offline'
  }
  const rows = (candidates.data ?? []).filter((candidate) => !onlyPending || pending(candidate))

  const run = async (action: () => Promise<ReleaseResult>, done: string) => {
    setBusy(true)
    setResult(null)
    setPromotion(null)
    try {
      const out = await action()
      const released = out.released ?? []
      setResult({
        tone: 'success',
        text: released.length
          ? `${stageLabels[stage]}已更新到 v${out.version}，${done} ${released.length} 项：${released.map((r) => `${r.name} v${r.version}`).join('、')}`
          : '所选对象在该环境已是当前草稿，没有变化。',
      })
      setPreview(null)
      states.reload()
      history.reload()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setPromotion((failure.body.diffs as Released[] | undefined) ?? [])
      }
      setResult({ tone: 'error', text: errorText(failure) })
    } finally {
      setBusy(false)
    }
  }

  const showPreview = async () => {
    setResult(null)
    try {
      setPreview((await gateway.preview(request())) ?? [])
    } catch (failure) {
      setResult({ tone: 'error', text: errorText(failure) })
    }
  }

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(key)
    else next.delete(key)
    setSelected(next)
    setPreview(null)
  }

  return (
    <>
      <PageHeader
        intro="登记与修改只是草稿；在某个环境点“上线”才在该环境生效，其他环境保持原样。上线前校验路由冲突、策略与接口状态、目标环境至少一个健康实例；上线生产时与预发不一致需填写原因。每次上线、下线、回滚都生成该环境的新版本并写入审计。"
        title="发布"
      >
        <Select aria-label="环境" onChange={(event) => { setStage((event.target.value || 'TEST') as Stage); setPreview(null); setPromotion(null) }} options={stageOptions} value={stage} />
      </PageHeader>
      <ErrorText error={candidates.error || states.error} />
      <Panel className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={onlyPending} label="只看未上线或有改动的" onChange={(event) => setOnlyPending(event.target.checked)} />
          <Button onClick={() => setSelected(new Set(rows.filter(pending).map((row) => targetKey(row.target))))}>勾选全部待上线</Button>
          <Button onClick={() => setSelected(new Set())} variant="ghost">清空</Button>
          <Muted>已选 {targets.length} 项</Muted>
        </div>
        <DataTable
          columns={[
            {
              label: '选择',
              render: (row) => (
                <Checkbox aria-label={`选择 ${row.name}`} checked={selected.has(targetKey(row.target))} onChange={(event) => toggle(targetKey(row.target), event.target.checked)} />
              ),
            },
            { label: '分组', render: (row) => row.group },
            { label: '对象', render: (row) => row.name },
            { label: '各环境', render: (row) => <StageStates states={states.data} target={row.target} /> },
          ]}
          empty={candidates.loading ? '加载中…' : '还没有登记分组或 API'}
          rowKey={(row) => targetKey(row.target)}
          rows={rows}
        />
        <Input aria-label="上线说明" onChange={(event) => setNote(event.target.value)} placeholder="本次上线说明" value={note} />
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={force} label="跳过健康实例检查（强制）" onChange={(event) => setForce(event.target.checked)} />
          <Input
            aria-label="原因"
            className="max-w-md"
            onChange={(event) => setReason(event.target.value)}
            placeholder={force || promotion ? '原因（必填）' : '原因（强制或生产与预发不一致时必填）'}
            value={reason}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || targets.length === 0} onClick={showPreview}>预览差异</Button>
          <Button disabled={busy || targets.length === 0} onClick={() => run(() => gateway.release(request()), '上线')} variant="primary">
            上线到{stageLabels[stage]}
          </Button>
          <Button
            disabled={busy || targets.length === 0}
            onClick={() => {
              if (window.confirm(`在${stageLabels[stage]}下线所选 ${targets.length} 项？下线后这些接口在该环境返回 404。`)) run(() => gateway.offline(request()), '下线')
            }}
            variant="ghost"
          >
            下线
          </Button>
        </div>
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
        {promotion?.length ? (
          <Panel>
            <SectionTitle>与预发不一致</SectionTitle>
            {promotion.map((diff) => <div key={targetKey(diff)}><b>{diff.name}</b><Diff diff={diff.diff} /></div>)}
          </Panel>
        ) : null}
      </Panel>
      {preview ? (
        <>
          <SectionTitle>预览：草稿与{stageLabels[stage]}正在生效的差异</SectionTitle>
          <DataTable
            columns={[
              { label: '对象', render: (row) => row.name ?? row.id },
              { label: '当前版本', render: (row) => row.version ? `v${row.version}` : '未上线', numeric: true },
              { label: '差异', render: (row) => row.error ? <Badge tone="red">{row.error}</Badge> : <Diff diff={row.diff} /> },
              ...(stage === 'RELEASE' ? [{ label: '与预发的差异', render: (row: Preview) => <Diff diff={row.preDiff} /> }] : []),
            ]}
            rowKey={(row) => targetKey(row)}
            rows={preview}
          />
        </>
      ) : null}
      <History history={history.data ?? []} onDone={() => { states.reload(); history.reload() }} stage={stage} />
      <ErrorText error={history.error} />
    </>
  )
}

export interface ReleaseRecord extends BaseRecord {
  stage: Stage
  kind: 'api' | 'group'
  target: string
  name: string
  version: number
  previousVersion: number
  definition: unknown
  actor: string
  note: string
  reason: string
  forced: boolean
  rollbackOf: number
}

export function History({ history, stage, onDone }: { history: ReleaseRecord[]; stage: Stage; onDone: () => void }) {
  const [error, setError] = useState('')
  const rollback = async (row: ReleaseRecord) => {
    const what = row.definition === null ? '下线状态' : `v${row.version}`
    if (!window.confirm(`把 ${row.name} 在${stageLabels[stage]}回滚到 ${what}？会生成一个新版本。`)) return
    setError('')
    try {
      await gateway.rollback({ stage, targets: [{ kind: row.kind, id: row.target }], note: `回滚到 v${row.version}`, version: row.version })
      onDone()
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  return (
    <>
      <SectionTitle>{stageLabels[stage]}上线记录</SectionTitle>
      <ErrorText error={error} />
      <DataTable
        columns={[
          { label: '时间', render: (row) => formatTime(row.created) },
          { label: '对象', render: (row) => `${row.kind === 'group' ? '分组 ' : ''}${row.name}` },
          { label: '版本', render: (row) => <>v{row.version}{row.definition === null ? <Badge className="ml-1">下线</Badge> : null}{row.rollbackOf ? <Badge className="ml-1" tone="blue">回滚自 v{row.rollbackOf}</Badge> : null}</> },
          { label: '操作人', render: (row) => row.actor },
          { label: '说明', render: (row) => <>{row.note}{row.forced ? <Badge className="ml-1" tone="red">强制</Badge> : null}{row.reason ? <Muted> 原因：{row.reason}</Muted> : null}</> },
          { label: '操作', render: (row) => <Button onClick={() => rollback(row)}>回滚到此版本</Button> },
        ]}
        empty="该环境还没有上线记录"
        rowKey={(row) => row.id}
        rows={history}
      />
    </>
  )
}
