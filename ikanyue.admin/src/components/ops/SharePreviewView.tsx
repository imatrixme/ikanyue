import { ShieldCheck } from 'lucide-react'

import type { SharePreview } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeader } from '../ui/Card'

interface SharePreviewViewProps {
  preview: SharePreview | null
}

export function SharePreviewView({ preview }: SharePreviewViewProps) {
  return (
    <Panel>
      <SectionHeader>
        <div>
          <h2 className="text-xl font-semibold">分享报告预览</h2>
          <p className="text-sm text-[#6f7880]">公开链接只读展示报告快照，不暴露后台账号字段。</p>
        </div>
        <Badge tone="green">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          已脱敏
        </Badge>
      </SectionHeader>
      <div className="p-4">
        {preview ? (
          <div className="mx-auto max-w-[720px] rounded-lg border border-[#d8dedb] bg-[#fffdf8] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d29a2e]">Report</p>
            <h3 className="mt-2 text-2xl font-semibold">{preview.title}</h3>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-white p-4">
                <div className="text-xs text-[#6f7880]">学员</div>
                <div className="mt-1 font-semibold">{preview.student.name}</div>
              </div>
              <div className="rounded-md bg-white p-4">
                <div className="text-xs text-[#6f7880]">教师</div>
                <div className="mt-1 font-semibold">{preview.teacher.name}</div>
              </div>
              <div className="rounded-md bg-white p-4">
                <div className="text-xs text-[#6f7880]">等级</div>
                <div className="mt-1 font-semibold">{preview.score.grade}</div>
              </div>
            </div>
            <div className="mt-6 rounded-md bg-[#174a5c] p-5 text-white">
              <div className="text-sm text-[#bdd9df]">总分</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums">{preview.score.totalScore}</div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-[#6f7880]">暂无分享报告</div>
        )}
      </div>
    </Panel>
  )
}
