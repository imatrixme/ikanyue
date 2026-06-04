import { Calculator, Send } from 'lucide-react'
import { useMemo, useState } from 'react'

import { scoreLocalAssessment, type AssessmentAnswers } from '../../app/assessment'
import type { AssessmentTemplate, ResourceRecord } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface AssessmentWorkspaceProps {
  template?: AssessmentTemplate | null
  templates?: AssessmentTemplate[]
  students?: ResourceRecord[]
  onSubmit?: (answers: AssessmentAnswers, options: { templateId?: string; studentId?: string }) => void | Promise<void>
  submitting?: boolean
}

export function AssessmentWorkspace({ template, templates = [], students = [], onSubmit, submitting = false }: AssessmentWorkspaceProps) {
  const [answers, setAnswers] = useState<AssessmentAnswers>({
    pitch_stability: 'good',
    breath_support: 82,
    expression_score: 76,
    pitch_comment: '音准稳定，尾音可继续控制气息。',
  })
  const availableTemplates = useMemo(() => (template ? [template, ...templates.filter((item) => item.id !== template.id)] : templates), [template, templates])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>()
  const firstTemplateId = availableTemplates[0]?.id || ''
  const effectiveTemplateId = selectedTemplateId && availableTemplates.some((item) => item.id === selectedTemplateId) ? selectedTemplateId : firstTemplateId
  const firstStudentId = String(students[0]?.id || '')
  const selectedStudentExists = Boolean(selectedStudentId && students.some((student) => String(student.id) === selectedStudentId))
  const effectiveStudentId = selectedStudentId === undefined ? firstStudentId : selectedStudentId === '' || selectedStudentExists ? selectedStudentId : firstStudentId
  const activeTemplate = availableTemplates.find((item) => item.id === effectiveTemplateId) || null
  const score = useMemo(() => (activeTemplate ? scoreLocalAssessment(activeTemplate, answers) : null), [answers, activeTemplate])

  if (!activeTemplate) {
    return <Panel className="p-6 text-sm text-[var(--muted-foreground)]">暂无可用评估模板</Panel>
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Panel>
        <SectionHeader>
          <div>
            <h2 className="text-xl font-semibold">评估工作台</h2>
            <p className="text-sm text-[var(--muted-foreground)]">{activeTemplate.name} · v{activeTemplate.version}</p>
          </div>
          <Button
            disabled={submitting}
            onClick={() => onSubmit?.(answers, { templateId: activeTemplate.id, studentId: effectiveStudentId })}
            icon={<Send className="h-4 w-4" aria-hidden="true" />}
          >
            {submitting ? '提交中' : '提交并生成报告'}
          </Button>
        </SectionHeader>
        <div className="grid gap-4 p-4">
          <div className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-4 md:grid-cols-2">
            <Field label="评估模板" htmlFor="assessment-template-select">
              <Select
                id="assessment-template-select"
                aria-label="评估模板"
                value={activeTemplate.id}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                options={availableTemplates.map((item) => ({ value: item.id, label: item.name }))}
                placeholder="选择模板"
              />
            </Field>
            <Field label="评估学员" htmlFor="assessment-student-select">
              <Select
                id="assessment-student-select"
                aria-label="评估学员"
                value={effectiveStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                options={students.map((student) => ({
                  value: String(student.id),
                  label: String(student.realName || student.nickName || student.id),
                }))}
                placeholder="未选择学员"
              />
            </Field>
          </div>
          {activeTemplate.schemaJson.sections.map((section) => (
            <section key={section.key} className="rounded-md border border-[var(--border)] p-4">
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
                        <Select
                          id={inputId}
                          aria-label={item.label}
                          value={String(answers[item.key] || '')}
                          onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })}
                          options={(item.options || []).map((option) => ({ value: option.value, label: option.label }))}
                        />
                      </Field>
                    )
                  }
                  if (item.type === 'textarea' || item.type === 'rich_comment') {
                    return (
                      <Field key={item.key} label={item.label} htmlFor={inputId}>
                        <textarea
                          id={inputId}
                          className="min-h-24 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15"
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
            <Calculator className="h-4 w-4 text-[var(--foreground)]" aria-hidden="true" />
            <h3 className="font-semibold">实时评分</h3>
          </div>
        </SectionHeader>
        <div className="p-4">
          <div className="text-4xl font-semibold tabular-nums">{score?.totalScore ?? 0}</div>
          <Badge className="mt-3" tone="green">等级 {score?.grade || '-'}</Badge>
          <div className="mt-5 grid gap-3">
            {(score?.lines || []).map((line) => (
              <div key={line.sectionKey} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--muted)]/35 p-3 text-sm">
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
