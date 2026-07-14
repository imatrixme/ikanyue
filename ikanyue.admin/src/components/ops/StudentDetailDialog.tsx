import { RefreshCw } from 'lucide-react'

import type { RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { Button } from '../ui/Button'
import { DialogShell } from '../ui/DialogShell'
import { PointEventsView } from './PointEventsPanel'

interface StudentDetailDialogProps {
  loading: boolean
  onClose: () => void
  onRetry: () => void
  rewards: RewardItem[]
  student: StudentPointsRow
  summary: StudentPointSummary | null
}

export function StudentDetailDialog({ loading, onClose, onRetry, rewards, student, summary }: StudentDetailDialogProps) {
  const balance = summary?.balance ?? student.balance
  const activeRewards = rewards.filter((item) => item.status === 'active').sort((a, b) => a.pointsPrice - b.pointsPrice)
  const redeemable = activeRewards.filter((item) => item.pointsPrice <= balance)
  const locked = activeRewards.filter((item) => item.pointsPrice > balance)

  return (
    <DialogShell description={`${student.cellphone || '无手机号'} · 当前 ${balance} 分`} onRequestClose={onClose} size="wide" title={`${studentName(student)}积分详情`}>
      {loading ? <div className="grid min-h-72 place-items-center text-sm text-[var(--muted-foreground)]">正在加载学员详情...</div> : summary ? (
        <div className="grid gap-6 p-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryValue label="当前积分" value={`${balance} 分`} emphasized />
            <SummaryValue label="可兑换实物" value={`${redeemable.length} 件`} />
            <SummaryValue label="继续积累" value={`${locked.length} 件`} />
          </section>
          <section className="grid gap-3">
            <h3 className="font-semibold">实物可兑换情况</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {redeemable.map((item) => <RewardStatus key={item.id} label="可兑换" name={item.name} value={`${item.pointsPrice} 分`} />)}
              {locked.map((item) => <RewardStatus key={item.id} label={`还差 ${item.pointsPrice - balance} 分`} name={item.name} value={`${item.pointsPrice} 分`} />)}
              {activeRewards.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">暂无上架实物。</p> : null}
            </div>
          </section>
          <section className="grid gap-3">
            <h3 className="font-semibold">积分记录</h3>
            <PointEventsView events={summary.events} />
          </section>
        </div>
      ) : (
        <div className="grid min-h-72 place-items-center gap-3 p-6 text-center"><div><p className="font-semibold">学员详情加载失败</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">列表仍可继续使用，可以重新加载详情。</p></div><Button icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry} type="button">重新加载</Button></div>
      )}
    </DialogShell>
  )
}

function SummaryValue({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return <div className="border-b border-[var(--border)] pb-3"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className={emphasized ? 'mt-1 text-2xl font-semibold text-[var(--point)]' : 'mt-1 text-2xl font-semibold'}>{value}</p></div>
}

function RewardStatus({ label, name, value }: { label: string; name: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-3"><div><p className="font-semibold">{name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</p></div><span className="font-semibold tabular-nums text-[var(--point)]">{value}</span></div>
}

function studentName(student: StudentPointsRow) {
  return student.realName || student.nickName || student.cellphone || '未命名学员'
}
