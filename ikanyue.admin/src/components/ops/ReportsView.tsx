import { ExternalLink, Link2 } from 'lucide-react'

import type { AssessmentReport, ListResult } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'

interface ReportsViewProps {
  data: ListResult<AssessmentReport> | null
  onPreviewShare: (reportId: string) => void
}

export function ReportsView({ data, onPreviewShare }: ReportsViewProps) {
  return (
    <Panel>
      <SectionHeader>
        <div>
          <h2 className="text-xl font-semibold">评估报告</h2>
          <p className="text-sm text-[#6f7880]">已提交评估会生成不可变报告快照，再单独创建分享链接。</p>
        </div>
      </SectionHeader>
      <div className="grid gap-3 p-4">
        {(data?.items || []).map((report) => (
          <article key={report.id} className="grid gap-3 rounded-md border border-[#e6ebe8] p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{report.id}</h3>
                <Badge tone="green">已生成</Badge>
                <Badge tone="blue">{report.grade}</Badge>
              </div>
              <p className="mt-1 text-sm text-[#6f7880]">学员 {report.studentId} · 教师 {report.teacherId} · 模板 {report.templateId}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-20 text-right text-2xl font-semibold tabular-nums">{report.totalScore}</div>
              <Button variant="secondary" onClick={() => onPreviewShare(report.id)} icon={<Link2 className="h-4 w-4" aria-hidden="true" />}>分享</Button>
              <Button variant="ghost" icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>查看</Button>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  )
}
