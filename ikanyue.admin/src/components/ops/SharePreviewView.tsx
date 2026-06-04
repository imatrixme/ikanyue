import { ShieldCheck } from 'lucide-react'

import type { SharePreview } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'

interface SharePreviewViewProps {
  preview: SharePreview | null
}

export function SharePreviewView({ preview }: SharePreviewViewProps) {
  return (
    <Panel>
      <PageHeader
        title="分享报告预览"
        description="公开链接只读展示报告快照，不暴露后台账号字段。"
        actions={(
          <Badge tone="green">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            已脱敏
          </Badge>
        )}
      />
      <div className="p-4">
        {preview ? (
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Report</p>
              <h3 className="mt-2 text-2xl font-semibold">{preview.title}</h3>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">学员</div>
                  <div className="mt-1 font-semibold">{preview.student.name}</div>
                </div>
                <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">教师</div>
                  <div className="mt-1 font-semibold">{preview.teacher.name}</div>
                </div>
                <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">等级</div>
                  <div className="mt-1 font-semibold">{preview.score.grade}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[var(--primary)] p-6 text-[var(--primary-foreground)] shadow-sm">
              <div className="text-sm text-slate-300">总分</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums">{preview.score.totalScore}</div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">暂无分享报告</div>
        )}
      </div>
    </Panel>
  )
}
