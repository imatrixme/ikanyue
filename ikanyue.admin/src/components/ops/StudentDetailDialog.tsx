import type { RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { SectionHeader, SummaryBand, SummaryMetric } from '../layout/Workspace'
import { AsyncState } from '../ui/DataDisplay'
import { DrawerShell } from '../ui/DrawerShell'
import { PointEventsView } from './PointEventsPanel'

interface StudentDetailDialogProps {
  loading: boolean
  onClose: () => void
  onRetry: () => void
  rewards: RewardItem[]
  student: StudentPointsRow
  summary: StudentPointSummary | null
}

export function StudentDetailDrawer({ loading, onClose, onRetry, rewards, student, summary }: StudentDetailDialogProps) {
  const balance = summary?.balance ?? student.balance
  const activeRewards = rewards.filter((item) => item.status === 'active').sort((a, b) => a.pointsPrice - b.pointsPrice)
  const redeemable = activeRewards.filter((item) => item.pointsPrice <= balance)
  const locked = activeRewards.filter((item) => item.pointsPrice > balance)

  return (
    <DrawerShell description={`${student.cellphone || '无手机号'} · 当前 ${balance} 分`} onRequestClose={onClose} size="wide" title={`${studentName(student)}积分详情`}>
      <AsyncState error={summary ? undefined : '列表仍可继续使用，可以重新加载详情。'} errorTitle="学员详情加载失败" loading={loading} loadingLabel="正在加载学员详情..." onRetry={onRetry}>
        {summary ? (
        <div className="grid gap-6 p-5">
          <SummaryBand><SummaryMetric label="当前积分" value={<span className="text-[var(--point)]">{balance} 分</span>} /><SummaryMetric label="可兑换实物" value={`${redeemable.length} 件`} /><SummaryMetric label="继续积累" value={`${locked.length} 件`} /></SummaryBand>
          <section className="grid gap-3">
            <SectionHeader title="实物可兑换情况" />
            <div className="grid gap-2 sm:grid-cols-2">
              {redeemable.map((item) => <RewardStatus key={item.id} label="可兑换" name={item.name} value={`${item.pointsPrice} 分`} />)}
              {locked.map((item) => <RewardStatus key={item.id} label={`还差 ${item.pointsPrice - balance} 分`} name={item.name} value={`${item.pointsPrice} 分`} />)}
              {activeRewards.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">暂无上架实物。</p> : null}
            </div>
          </section>
          <section className="grid gap-3">
            <SectionHeader title="积分记录" />
            <PointEventsView events={summary.events} />
          </section>
        </div>
        ) : null}
      </AsyncState>
    </DrawerShell>
  )
}

function RewardStatus({ label, name, value }: { label: string; name: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-3"><div><p className="font-semibold">{name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</p></div><span className="font-semibold tabular-nums text-[var(--point)]">{value}</span></div>
}

function studentName(student: StudentPointsRow) {
  return student.realName || student.nickName || student.cellphone || '未命名学员'
}
