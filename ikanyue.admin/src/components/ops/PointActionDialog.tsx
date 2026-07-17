import { ArrowLeft, Check, Gift, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { RewardItem, StudentPointsRow } from '../../app/types'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Controls'
import { DialogShell } from '../ui/DialogShell'
import { Alert } from '../ui/Feedback'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { RewardMedia } from './RewardMedia'

interface PointActionDialogProps {
  loading: boolean
  mode: 'grant' | 'redeem'
  onAddPoints: (studentId: string, payload: { amount: number; reason?: string; remark?: string }) => Promise<boolean | void>
  onClose: () => void
  onRedeem: (studentId: string, itemId: string, remark?: string) => Promise<boolean | void>
  rewards: RewardItem[]
  student: StudentPointsRow
}

export function PointActionDialog({ loading, mode, onAddPoints, onClose, onRedeem, rewards, student }: PointActionDialogProps) {
  const [stage, setStage] = useState<'edit' | 'review'>('edit')
  const [amount, setAmount] = useState('20')
  const [reason, setReason] = useState('课堂奖励')
  const [grantRemark, setGrantRemark] = useState('')
  const [itemId, setItemId] = useState('')
  const [redeemRemark, setRedeemRemark] = useState('已线下领取')
  const redeemable = useMemo(
    () => rewards.filter((item) => item.status === 'active' && item.pointsPrice <= student.balance).sort((a, b) => a.pointsPrice - b.pointsPrice),
    [rewards, student.balance],
  )
  const selectedId = itemId || redeemable[0]?.id || ''
  const selectedReward = redeemable.find((item) => item.id === selectedId) || null
  const delta = mode === 'grant' ? Number(amount) : -(selectedReward?.pointsPrice || 0)
  const title = mode === 'grant' ? `为${studentName(student)}增加积分` : `${studentName(student)}线下兑换`

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'grant' && Number(amount) > 0) setStage('review')
    if (mode === 'redeem' && selectedReward) setStage('review')
  }

  async function confirm() {
    const succeeded = mode === 'grant'
      ? await onAddPoints(student.id, { amount: Number(amount), reason, remark: grantRemark })
      : selectedReward ? await onRedeem(student.id, selectedReward.id, redeemRemark) : false
    if (succeeded !== false) onClose()
  }

  return (
    <DialogShell
      description={`当前积分 ${student.balance} 分，操作对象已锁定`}
      onRequestClose={onClose}
      size="compact"
      title={stage === 'review' ? (mode === 'grant' ? '确认增加积分' : '确认线下兑换') : title}
    >
      {stage === 'edit' ? (
        <form className="grid gap-4 p-5" onSubmit={review}>
          <LockedStudent student={student} />
          {mode === 'grant' ? (
            <>
              <Field label="积分数量" htmlFor="points-amount"><Input data-autofocus id="points-amount" min="1" step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
              <Field label="原因" htmlFor="points-reason"><Input id="points-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
              <Field label="备注" htmlFor="points-remark"><Textarea id="points-remark" value={grantRemark} onChange={(event) => setGrantRemark(event.target.value)} /></Field>
              <Button disabled={loading || Number(amount) <= 0} icon={<Plus className="h-4 w-4" />}>复核加分结果</Button>
            </>
          ) : (
            <>
              <Field label="可兑换实物" htmlFor="reward-item">
                <Select data-autofocus id="reward-item" options={redeemable.map((item) => ({ value: item.id, label: `${item.name} · ${item.pointsPrice} 分` }))} placeholder="暂无可兑换实物" value={selectedId} onChange={(event) => setItemId(event.target.value)} />
              </Field>
              {selectedReward ? <RewardChoice reward={selectedReward} /> : <Alert tone="warning">当前积分还不能兑换任何上架实物。</Alert>}
              <Field label="兑换备注" htmlFor="redeem-remark"><Textarea id="redeem-remark" value={redeemRemark} onChange={(event) => setRedeemRemark(event.target.value)} /></Field>
              <Button disabled={loading || !selectedReward} icon={<Gift className="h-4 w-4" />}>复核兑换结果</Button>
            </>
          )}
        </form>
      ) : (
        <div className="grid gap-5 p-5">
          <LockedStudent student={student} />
          <div className="rounded-md border border-[var(--border)] bg-[var(--brand-wash)] p-4">
            <p className="font-semibold">{mode === 'grant' ? `${reason || '未填写原因'} · 增加 ${amount} 分` : `${selectedReward?.name} · 扣除 ${selectedReward?.pointsPrice} 分`}</p>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <BalanceValue label="当前积分" value={student.balance} />
              <span className="text-[var(--muted-foreground)]">→</span>
              <BalanceValue emphasized label="操作后" value={student.balance + delta} />
            </div>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">确认后将写入积分流水，不能在此页面撤销。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={loading} icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStage('edit')} type="button" variant="secondary">返回修改</Button>
            <Button data-autofocus disabled={loading} icon={<Check className="h-4 w-4" />} onClick={() => void confirm()} type="button">确认执行</Button>
          </div>
        </div>
      )}
    </DialogShell>
  )
}

function LockedStudent({ student }: { student: StudentPointsRow }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4"><div><p className="font-semibold">{studentName(student)}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">{student.cellphone || '无手机号'}</p></div><p className="text-xl font-semibold tabular-nums text-[var(--point)]">{student.balance} 分</p></div>
}

function RewardChoice({ reward }: { reward: RewardItem }) {
  return <div className="flex items-center gap-3 rounded-md border border-[var(--border)] p-3"><RewardMedia className="w-20" name={reward.name} src={reward.image} /><div><p className="font-semibold">{reward.name}</p><p className="mt-1 text-sm font-semibold text-[var(--point)]">{reward.pointsPrice} 分</p></div></div>
}

function BalanceValue({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: number }) {
  return <div><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className={emphasized ? 'mt-1 text-2xl font-semibold tabular-nums text-[var(--point)]' : 'mt-1 text-2xl font-semibold tabular-nums'}>{value}</p></div>
}

function studentName(student: StudentPointsRow) {
  return student.realName || student.nickName || student.cellphone || '未命名学员'
}
