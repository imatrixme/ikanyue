import { Gift, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { RewardItem, StudentPointsRow } from '../../app/types'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { cn } from '../ui/utils'
import { RewardMedia } from './RewardMedia'

interface PointActionPanelProps {
  currentBalance: number
  loading: boolean
  lockedRewards: RewardItem[]
  onAddPoints: (payload: { amount: number; reason?: string; remark?: string }) => Promise<boolean | void>
  onRedeem: (itemId: string, remark?: string) => Promise<boolean | void>
  redeemableRewards: RewardItem[]
  student: StudentPointsRow | null
}

type ActionMode = 'grant' | 'redeem'

type PendingAction =
  | { type: 'grant'; amount: number; reason: string; remark: string }
  | { type: 'redeem'; reward: RewardItem; remark: string }

export function PointActionPanel(props: PointActionPanelProps) {
  const [mode, setMode] = useState<ActionMode>('grant')
  const [amount, setAmount] = useState('20')
  const [reason, setReason] = useState('课堂奖励')
  const [grantRemark, setGrantRemark] = useState('')
  const [itemId, setItemId] = useState('')
  const [redeemRemark, setRedeemRemark] = useState('已线下领取')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const selectedId = itemId || props.redeemableRewards[0]?.id || ''
  const selectedReward = useMemo(
    () => props.redeemableRewards.find((item) => item.id === selectedId) || null,
    [props.redeemableRewards, selectedId],
  )

  function previewGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!props.student) return
    setPending({ type: 'grant', amount: Number(amount), reason, remark: grantRemark })
  }

  function previewRedemption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!props.student || !selectedReward) return
    setPending({ type: 'redeem', reward: selectedReward, remark: redeemRemark })
  }

  async function confirm() {
    if (!pending) return
    if (pending.type === 'grant') {
      const succeeded = await props.onAddPoints({ amount: pending.amount, reason: pending.reason, remark: pending.remark })
      if (succeeded === false) return
      setAmount('20')
      setGrantRemark('')
    } else {
      const succeeded = await props.onRedeem(pending.reward.id, pending.remark)
      if (succeeded === false) return
    }
    setPending(null)
  }

  return (
    <>
      <Panel className="overflow-hidden">
        <div className="flex border-b border-[var(--border)] bg-[var(--muted)]/55 p-1.5" aria-label="积分操作方式" role="tablist">
          <ModeButton active={mode === 'grant'} icon={<Plus className="h-4 w-4" />} label="增加积分" onClick={() => setMode('grant')} />
          <ModeButton active={mode === 'redeem'} icon={<Gift className="h-4 w-4" />} label="线下兑换" onClick={() => setMode('redeem')} />
        </div>
        {mode === 'grant' ? (
          <form className="grid gap-4 p-5" onSubmit={previewGrant}>
            <div>
              <h3 className="font-semibold">为当前学员增加积分</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">提交前会显示积分变化，确认后才写入流水。</p>
            </div>
            <Field label="积分数量" htmlFor="points-amount">
              <Input id="points-amount" min="1" step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="原因" htmlFor="points-reason">
              <Input id="points-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <Field label="备注" htmlFor="points-remark">
              <Input id="points-remark" value={grantRemark} onChange={(event) => setGrantRemark(event.target.value)} />
            </Field>
            <Button disabled={props.loading || !props.student}>预览加分结果</Button>
          </form>
        ) : (
          <form className="grid gap-4 p-5" onSubmit={previewRedemption}>
            <div>
              <h3 className="font-semibold">确认线下领取实物</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">只显示当前积分足够兑换的上架实物。</p>
            </div>
            <Field label="可兑换实物" htmlFor="reward-item">
              <Select
                id="reward-item"
                options={props.redeemableRewards.map((item) => ({ value: item.id, label: `${item.name} · ${item.pointsPrice} 分` }))}
                placeholder="暂无可兑换实物"
                value={selectedId}
                onChange={(event) => setItemId(event.target.value)}
              />
            </Field>
            {selectedReward ? (
              <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/45 p-3">
                <RewardMedia className="w-20" name={selectedReward.name} src={selectedReward.image} />
                <div className="min-w-0">
                  <p className="font-semibold">{selectedReward.name}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--point)]">{selectedReward.pointsPrice} 分</p>
                </div>
              </div>
            ) : null}
            <Field label="兑换备注" htmlFor="redeem-remark">
              <Input id="redeem-remark" value={redeemRemark} onChange={(event) => setRedeemRemark(event.target.value)} />
            </Field>
            <Button disabled={props.loading || !props.student || !selectedReward}>预览兑换结果</Button>
            <LockedRewards rewards={props.lockedRewards} />
          </form>
        )}
      </Panel>
      {pending && props.student ? (
        <ConfirmationDialog
          balance={props.currentBalance}
          loading={props.loading}
          pending={pending}
          student={props.student}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </>
  )
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={cn('flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors', active ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]')}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}{label}
    </button>
  )
}

function LockedRewards({ rewards }: { rewards: RewardItem[] }) {
  if (rewards.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">所有上架实物当前均可兑换。</p>
  return (
    <details className="rounded-md border border-[var(--border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold">查看暂不可兑换实物（{rewards.length}）</summary>
      <div className="mt-3 grid gap-2">
        {rewards.map((item) => <div key={item.id} className="flex justify-between text-sm"><span>{item.name}</span><span className="text-[var(--muted-foreground)]">{item.pointsPrice} 分</span></div>)}
      </div>
    </details>
  )
}

function ConfirmationDialog({ balance, loading, pending, student, onCancel, onConfirm }: { balance: number; loading: boolean; pending: PendingAction; student: StudentPointsRow; onCancel: () => void; onConfirm: () => void }) {
  const delta = pending.type === 'grant' ? pending.amount : -pending.reward.pointsPrice
  const nextBalance = balance + delta
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6" role="presentation">
      <section aria-labelledby="point-confirmation-title" aria-modal="true" className="w-full max-w-md rounded-t-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl sm:rounded-lg" role="dialog">
        <p className="text-xs font-semibold text-[var(--muted-foreground)]">操作确认</p>
        <h2 className="mt-1 text-xl font-semibold" id="point-confirmation-title">{pending.type === 'grant' ? '确认增加积分' : '确认线下兑换'}</h2>
        <div className="mt-5 rounded-md border border-[var(--border)] bg-[var(--muted)]/45 p-4">
          <p className="font-semibold">{student.realName || student.nickName || student.cellphone}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{pending.type === 'grant' ? `${pending.reason || '未填写原因'} · 增加 ${pending.amount} 分` : `${pending.reward.name} · 扣除 ${pending.reward.pointsPrice} 分`}</p>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <BalanceValue label="当前积分" value={balance} />
            <span className="text-[var(--muted-foreground)]">→</span>
            <BalanceValue label="操作后" value={nextBalance} emphasized />
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">确认后将写入积分流水，不能在此页面撤销。</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={loading} onClick={onCancel} type="button" variant="secondary">返回修改</Button>
          <Button disabled={loading} onClick={onConfirm} type="button">确认执行</Button>
        </div>
      </section>
    </div>
  )
}

function BalanceValue({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) {
  return <div><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className={cn('mt-1 text-2xl font-semibold tabular-nums', emphasized && 'text-[var(--point)]')}>{value}</p></div>
}
