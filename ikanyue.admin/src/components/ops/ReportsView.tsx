import { ExternalLink, Link2, RotateCcw } from 'lucide-react'

import type { AssessmentReport, AssessmentReportDetail, ListResult, ShareLink } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'

interface ReportsViewProps {
  data: ListResult<AssessmentReport> | null
  detail?: AssessmentReportDetail | null
  shareLink?: ShareLink | null
  onOpenDetail: (reportId: string) => void
  onCreateShare: (reportId: string) => void
  onRevokeShare: (shareId: string) => void
  onPreviewShare: (reportId: string) => void
}

export function ReportsView({ data, detail, shareLink, onOpenDetail, onCreateShare, onRevokeShare, onPreviewShare }: ReportsViewProps) {
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
              <Button variant="secondary" onClick={() => onCreateShare(report.id)} icon={<Link2 className="h-4 w-4" aria-hidden="true" />}>创建分享</Button>
              <Button variant="ghost" onClick={() => onPreviewShare(report.id)} icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>预览</Button>
              <Button variant="ghost" onClick={() => onOpenDetail(report.id)} icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>查看</Button>
            </div>
          </article>
        ))}
      </div>
      {shareLink ? (
        <div className="border-t border-[#e6ebe8] p-4">
          <div className="rounded-md border border-[#d8dedb] bg-[#f7faf9] p-3 text-sm">
            <p className="font-semibold">分享链接</p>
            <p className="mt-1 text-[#6f7880]">Token: {shareLink.token || '已撤销'}</p>
            {shareLink.revokedAt ? <Badge tone="red">已撤销</Badge> : <Button className="mt-2" variant="danger" onClick={() => onRevokeShare(shareLink.id)} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>撤销分享</Button>}
          </div>
        </div>
      ) : null}
      {detail ? (
        <div className="border-t border-[#e6ebe8] p-4">
          <div className="grid gap-4 rounded-md border border-[#d8dedb] bg-[#fbfcfb] p-4">
            <div>
              <h3 className="text-lg font-semibold">报告详情</h3>
              <p className="text-sm text-[#6f7880]">{detail.title} · {detail.generatedAt}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Summary label="学员" value={detail.student.name || detail.student.realName || detail.student.nickName || '-'} />
              <Summary label="教师" value={detail.teacher.name || detail.teacher.realName || detail.teacher.nickName || '-'} />
              <Summary label="总分" value={`${detail.score.totalScore} / ${detail.score.grade}`} />
            </div>
            {detail.summary ? <p className="text-sm leading-6 text-[#39434d]">{detail.summary}</p> : null}
            <div className="grid gap-2">
              {(detail.sections || detail.score.sections || []).map((section) => (
                <div key={section.key} className="rounded-md border border-[#e6ebe8] bg-white p-3">
                  <p className="font-semibold">{section.title} {section.score !== undefined ? `· ${section.score}` : ''}</p>
                  {section.comment ? <p className="mt-1 text-sm text-[#6f7880]">{section.comment}</p> : null}
                </div>
              ))}
            </div>
            {detail.recommendations?.length ? (
              <div className="text-sm text-[#39434d]">
                <p className="font-semibold">建议</p>
                {detail.recommendations.map((item) => <p key={item}>· {item}</p>)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f7880]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}
