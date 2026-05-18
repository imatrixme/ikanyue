import { CheckCircle2, Plus } from 'lucide-react'

import type { ListResult, AssessmentTemplate } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { statusTone } from '../ui/status'

interface TemplatesViewProps {
  data: ListResult<AssessmentTemplate> | null
}

export function TemplatesView({ data }: TemplatesViewProps) {
  return (
    <Panel>
      <SectionHeader>
        <div>
          <h2 className="text-xl font-semibold">评估表模板</h2>
          <p className="text-sm text-[#6f7880]">模板结构、评分规则和报告配置统一版本化。</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" aria-hidden="true" />}>新建模板</Button>
      </SectionHeader>
      <div className="grid gap-3 p-4">
        {(data?.items || []).map((template) => (
          <article key={template.id} className="rounded-md border border-[#e6ebe8] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  <Badge tone={statusTone(template.status)}>{template.status === 'published' ? '已发布' : '草稿'}</Badge>
                </div>
                <p className="mt-1 text-sm text-[#6f7880]">v{template.version} · {template.schemaJson.sections.length} 个维度 · {template.scoringJson.type}</p>
              </div>
              <Button variant="secondary" icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                发布
              </Button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {template.schemaJson.sections.map((section) => (
                <div key={section.key} className="rounded-md bg-[#f7faf9] p-3">
                  <div className="font-semibold">{section.title}</div>
                  <div className="mt-1 text-sm text-[#6f7880]">权重 {Math.round(section.weight * 100)}% · {section.items.length} 项</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  )
}
