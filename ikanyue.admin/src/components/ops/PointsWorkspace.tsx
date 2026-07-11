import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Input } from '../ui/Input'
import { cn } from '../ui/utils'
import { PointActionPanel } from './PointActionPanel'
import { PointEventsPanel } from './PointEventsPanel'

interface PointsWorkspaceProps {
  loading: boolean
  rewards: RewardItem[]
  selectedStudentId: string
  studentSummary: StudentPointSummary | null
  students: StudentPointsRow[]
  onAddPoints: (payload: { amount: number; reason?: string; remark?: string }) => Promise<boolean | void>
  onRedeem: (itemId: string, remark?: string) => Promise<boolean | void>
  onSearchStudents: (keyword: string) => Promise<void>
  onSelectStudent: (studentId: string) => Promise<void>
}

export function PointsWorkspace(props: PointsWorkspaceProps) {
  const [keyword, setKeyword] = useState('')
  const selectedStudent = props.students.find((student) => student.id === props.selectedStudentId) || props.students[0] || null
  const currentBalance = props.studentSummary?.balance ?? selectedStudent?.balance ?? 0
  const activeRewards = useMemo(() => props.rewards.filter((item) => item.status === 'active').sort((a, b) => a.pointsPrice - b.pointsPrice), [props.rewards])
  const redeemableRewards = activeRewards.filter((item) => item.pointsPrice <= currentBalance)
  const lockedRewards = activeRewards.filter((item) => item.pointsPrice > currentBalance)

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await props.onSearchStudents(keyword)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel className="overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">选择学员</h2>
            <Badge tone="blue">{props.students.length} 人</Badge>
          </div>
          <form className="mt-4 flex gap-2" onSubmit={search}>
            <Input aria-label="搜索学员" className="min-w-0 flex-1" placeholder="姓名 / 昵称 / 手机号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            <Button aria-label="搜索" className="h-10 w-10 px-0" disabled={props.loading} icon={<Search className="h-4 w-4" aria-hidden="true" />} type="submit" />
          </form>
        </div>
        <div className="grid max-h-[360px] gap-1 overflow-y-auto p-2 xl:max-h-[calc(100vh-14rem)]">
          {props.students.map((student) => (
            <button
              key={student.id}
              className={cn('grid gap-1 rounded-md px-3 py-3 text-left transition-colors', student.id === props.selectedStudentId ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'hover:bg-[var(--secondary)]')}
              onClick={() => void props.onSelectStudent(student.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3"><span className="font-semibold">{student.realName || student.nickName || student.cellphone}</span><span className="text-sm tabular-nums">{student.balance} 分</span></span>
              <span className={student.id === props.selectedStudentId ? 'text-xs text-[var(--primary-foreground)]/75' : 'text-xs text-[var(--muted-foreground)]'}>{student.nickName || '未填昵称'} · {student.cellphone || '无手机号'}</span>
            </button>
          ))}
          {props.students.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">暂无匹配学员</div> : null}
        </div>
      </Panel>

      <div className="grid min-w-0 gap-5">
        <StudentContext student={selectedStudent} balance={currentBalance} />
        <PointActionPanel
          currentBalance={currentBalance}
          loading={props.loading}
          lockedRewards={lockedRewards}
          onAddPoints={props.onAddPoints}
          onRedeem={props.onRedeem}
          redeemableRewards={redeemableRewards}
          student={selectedStudent}
        />
        <PointEventsPanel events={props.studentSummary?.events || []} />
      </div>
    </div>
  )
}

function StudentContext({ student, balance }: { student: StudentPointsRow | null; balance: number }) {
  return (
    <Panel className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">当前操作学员</p>
          <h2 className="mt-1 truncate text-2xl font-semibold">{student?.realName || student?.nickName || '请选择学员'}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{student?.cellphone || '选择后可增加积分或确认线下兑换'}</p>
        </div>
        <div className="shrink-0 rounded-md border border-[var(--point-border)] bg-[var(--point-soft)] px-5 py-3 text-right">
          <p className="text-xs text-[var(--muted-foreground)]">当前积分</p>
          <p className="text-3xl font-semibold tabular-nums text-[var(--point)]">{balance}</p>
        </div>
      </div>
    </Panel>
  )
}
