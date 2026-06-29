import { Gift, History, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { cn } from '../ui/utils'

interface PointsWorkspaceProps {
  loading: boolean
  rewards: RewardItem[]
  selectedStudentId: string
  studentSummary: StudentPointSummary | null
  students: StudentPointsRow[]
  onAddPoints: (payload: { amount: number; reason?: string; remark?: string }) => Promise<void>
  onRedeem: (itemId: string, remark?: string) => Promise<void>
  onSearchStudents: (keyword: string) => Promise<void>
  onSelectStudent: (studentId: string) => Promise<void>
}

export function PointsWorkspace({
  loading,
  rewards,
  selectedStudentId,
  studentSummary,
  students,
  onAddPoints,
  onRedeem,
  onSearchStudents,
  onSelectStudent,
}: PointsWorkspaceProps) {
  const [keyword, setKeyword] = useState('')
  const selectedStudent = students.find((student) => student.id === selectedStudentId) || students[0] || null
  const currentBalance = studentSummary?.balance ?? selectedStudent?.balance ?? 0
  const activeRewards = useMemo(() => rewards.filter((item) => item.status === 'active').sort((a, b) => a.pointsPrice - b.pointsPrice), [rewards])
  const redeemableRewards = activeRewards.filter((item) => item.pointsPrice <= currentBalance)
  const lockedRewards = activeRewards.filter((item) => item.pointsPrice > currentBalance)

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSearchStudents(keyword)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Learners</p>
              <h2 className="text-lg font-semibold">学员积分</h2>
            </div>
            <Badge tone="blue">{students.length} 人</Badge>
          </div>
          <form className="mt-4 flex gap-2" onSubmit={search}>
            <Input
              aria-label="搜索学员"
              className="min-w-0 flex-1"
              placeholder="姓名 / 昵称 / 手机号"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Button className="px-3" disabled={loading} icon={<Search className="h-4 w-4" aria-hidden="true" />} type="submit">
              搜索
            </Button>
          </form>
        </div>
        <div className="grid max-h-[calc(100vh-15rem)] gap-1 overflow-y-auto p-2">
          {students.map((student) => (
            <button
              key={student.id}
              className={cn(
                'grid gap-1 rounded-md px-3 py-3 text-left transition-colors',
                student.id === selectedStudentId
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                  : 'hover:bg-[var(--secondary)]',
              )}
              onClick={() => void onSelectStudent(student.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{student.realName || student.nickName || student.cellphone}</span>
                <span className="text-sm tabular-nums">{student.balance} 分</span>
              </span>
              <span className={student.id === selectedStudentId ? 'text-xs text-[var(--primary-foreground)]/75' : 'text-xs text-[var(--muted-foreground)]'}>
                {student.nickName || '未填昵称'} · {student.cellphone || '无手机号'}
              </span>
            </button>
          ))}
          {students.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              暂无匹配学员
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-5">
        <StudentSummaryHeader student={selectedStudent} balance={currentBalance} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <AddPointsPanel loading={loading} onSubmit={onAddPoints} />
          <RewardExchangePanel
            lockedRewards={lockedRewards}
            loading={loading}
            onRedeem={onRedeem}
            redeemableRewards={redeemableRewards}
          />
        </div>
        <PointEventsPanel events={studentSummary?.events || []} />
      </div>
    </div>
  )
}

function StudentSummaryHeader({ student, balance }: { student: StudentPointsRow | null; balance: number }) {
  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[var(--muted-foreground)]">Selected learner</p>
          <h2 className="mt-1 text-2xl font-semibold">{student?.realName || student?.nickName || '请选择学员'}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{student?.cellphone || '选择学员后可加分或线下兑换'}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-5 py-3 text-right">
          <p className="text-xs text-[var(--muted-foreground)]">当前积分</p>
          <p className="text-3xl font-semibold tabular-nums">{balance}</p>
        </div>
      </div>
    </Panel>
  )
}

function AddPointsPanel({ loading, onSubmit }: { loading: boolean; onSubmit: PointsWorkspaceProps['onAddPoints'] }) {
  const [amount, setAmount] = useState('20')
  const [reason, setReason] = useState('课堂奖励')
  const [remark, setRemark] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({ amount: Number(amount), reason, remark })
    setAmount('20')
    setRemark('')
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Plus className="h-4 w-4" aria-hidden="true" />
          增加积分
        </h3>
      </div>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <Field label="积分数量" htmlFor="points-amount">
          <Input id="points-amount" min="1" step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="原因" htmlFor="points-reason">
          <Input id="points-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Field label="备注" htmlFor="points-remark">
          <Input id="points-remark" value={remark} onChange={(event) => setRemark(event.target.value)} />
        </Field>
        <Button disabled={loading}>确认加分</Button>
      </form>
    </Panel>
  )
}

function RewardExchangePanel({
  lockedRewards,
  loading,
  onRedeem,
  redeemableRewards,
}: {
  lockedRewards: RewardItem[]
  loading: boolean
  onRedeem: PointsWorkspaceProps['onRedeem']
  redeemableRewards: RewardItem[]
}) {
  const [itemId, setItemId] = useState('')
  const [remark, setRemark] = useState('已线下领取')
  const selectedId = itemId || redeemableRewards[0]?.id || ''

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId) {
      return
    }
    await onRedeem(selectedId, remark)
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gift className="h-4 w-4" aria-hidden="true" />
          线下兑换
        </h3>
      </div>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <Field label="可兑换实物" htmlFor="reward-item">
          <Select
            id="reward-item"
            options={redeemableRewards.map((item) => ({ value: item.id, label: `${item.name} · ${item.pointsPrice} 分` }))}
            placeholder="选择实物"
            value={selectedId}
            onChange={(event) => setItemId(event.target.value)}
          />
        </Field>
        <Field label="兑换备注" htmlFor="redeem-remark">
          <Input id="redeem-remark" value={remark} onChange={(event) => setRemark(event.target.value)} />
        </Field>
        <Button disabled={loading || !selectedId}>扣除积分并确认领取</Button>
      </form>
      <div className="border-t border-[var(--border)] px-5 py-4">
        <h4 className="text-sm font-semibold">当前不可兑换</h4>
        <div className="mt-3 grid gap-2">
          {lockedRewards.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-[var(--muted)] px-3 py-2 text-sm">
              <span>{item.name}</span>
              <span className="text-[var(--muted-foreground)]">{item.pointsPrice} 分</span>
            </div>
          ))}
          {lockedRewards.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">所有上架实物当前均可兑换。</p> : null}
        </div>
      </div>
    </Panel>
  )
}

function PointEventsPanel({ events }: { events: StudentPointSummary['events'] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <History className="h-4 w-4" aria-hidden="true" />
          积分流水
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]/70 text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">变化</th>
              <th className="px-4 py-3 font-medium">余额</th>
              <th className="px-4 py-3 font-medium">原因</th>
              <th className="px-4 py-3 font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">{event.type === 'offline_redeem' ? '线下兑换' : '增加积分'}</td>
                <td className={cn('px-4 py-3 font-semibold tabular-nums', event.delta < 0 ? 'text-[var(--destructive)]' : 'text-[var(--success)]')}>
                  {event.delta > 0 ? '+' : ''}{event.delta}
                </td>
                <td className="px-4 py-3 tabular-nums">{event.balanceAfter}</td>
                <td className="px-4 py-3">{event.rewardSnapshot?.name || event.reason || event.remark || '-'}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDate(event.created)}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-[var(--muted-foreground)]" colSpan={5}>
                  暂无积分流水
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function formatDate(value?: string) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
