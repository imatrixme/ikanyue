import { Calculator, Send } from 'lucide-react'
import { useMemo, useState } from 'react'

import { scoreLocalAssessment, type AssessmentAnswers } from '../../app/assessment'
import type { AssessmentTemplate } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { Field, Input } from '../ui/Input'

interface AssessmentWorkspaceProps {
  template: AssessmentTemplate | null
  onSubmit?: (answers: AssessmentAnswers) => void | Promise<void>
  submitting?: boolean
}

export function AssessmentWorkspace({ template, onSubmit, submitting = false }: AssessmentWorkspaceProps) {
  const [answers, setAnswers] = useState<AssessmentAnswers>({
    pitch_stability: 'good',
    breath_support: 82,
    expression_score: 76,
    pitch_comment: '音准稳定，尾音可继续控制气息。',
  })
  const score = useMemo(() => (template ? scoreLocalAssessment(template, answers) : null), [answers, template])

  if (!template) {
    return <Panel className="p-6 text-sm text-[#6f7880]">暂无可用评估模板</Panel>
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Panel>
        <SectionHeader>
          <div>
            <h2 className="text-xl font-semibold">评估工作台</h2>
            <p className="text-sm text-[#6f7880]">{template.name} · v{template.version}</p>
          </div>
          <Button disabled={submitting} onClick={() => onSubmit?.(answers)} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
            {submitting ? '提交中' : '提交并生成报告'}
          </Button>
        </SectionHeader>
        <div className="grid gap-4 p-4">
          {template.schemaJson.sections.map((section) => (
            <section key={section.key} className="rounded-md border border-[#e6ebe8] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{section.title}</h3>
                <Badge tone="blue">权重 {Math.round(section.weight * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {section.items.map((item) => {
                  const inputId = `assessment-${item.key}`
                  if (item.type === 'single_choice') {
                    return (
                      <Field key={item.key} label={item.label} htmlFor={inputId}>
                        <select
                          id={inputId}
                          className="h-10 rounded-md border border-[#d8dedb] bg-white px-3 text-sm"
                          value={String(answers[item.key] || '')}
                          onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })}
                        >
                          {(item.options || []).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                    )
                  }
                  if (item.type === 'textarea' || item.type === 'rich_comment') {
                    return (
                      <Field key={item.key} label={item.label} htmlFor={inputId}>
                        <textarea
                          id={inputId}
                          className="min-h-24 rounded-md border border-[#d8dedb] bg-white px-3 py-2 text-sm"
                          value={String(answers[item.key] || '')}
                          onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })}
                        />
                      </Field>
                    )
                  }
                  return (
                    <Field key={item.key} label={item.label} htmlFor={inputId}>
                      <Input
                        id={inputId}
                        type="number"
                        min={0}
                        max={100}
                        value={Number(answers[item.key] || 0)}
                        onChange={(event) => setAnswers({ ...answers, [item.key]: Number(event.target.value) })}
                      />
                    </Field>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </Panel>
      <Panel className="h-fit">
        <SectionHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-[#174a5c]" aria-hidden="true" />
            <h3 className="font-semibold">实时评分</h3>
          </div>
        </SectionHeader>
        <div className="p-4">
          <div className="text-4xl font-semibold tabular-nums">{score?.totalScore ?? 0}</div>
          <Badge className="mt-3" tone="green">等级 {score?.grade || '-'}</Badge>
          <div className="mt-5 grid gap-3">
            {(score?.lines || []).map((line) => (
              <div key={line.sectionKey} className="flex items-center justify-between rounded-md bg-[#f7faf9] p-3 text-sm">
                <span>{line.label}</span>
                <span className="font-semibold tabular-nums">{line.weightedScore}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  )
}
