import { ArrowLeft, ArrowRight, CheckCircle2, Save } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { buildGuidedPlan, initialGuidedAnswers } from '../../app/guidedWorkflows'
import type { GuidedWorkflowDraft } from '../../app/guidedWorkflowDrafts'
import type { GuidedAnswers, GuidedAnswerValue, GuidedField, GuidedPlan, GuidedWorkflow } from '../../app/guidedWorkflows'
import type { ResourceLookup } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EntityPicker } from '../ui/EntityPicker'
import { FilePicker } from '../ui/FilePicker'
import { FloatingTooltip } from '../ui/FloatingTooltip'
import { Field, Input } from '../ui/Input'
import { LocationPicker } from '../ui/LocationPicker'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'
import { Switch } from '../ui/Switch'
import { DateTimePicker } from '../ui/DateTimePicker'
import { cn } from '../ui/utils'
import { DocumentEditorModal } from './DocumentEditorModal'

interface GuidedCreateDialogProps {
  open: boolean
  workflow: GuidedWorkflow | null
  resources?: ResourceLookup
  draft?: GuidedWorkflowDraft | null
  submitting?: boolean
  onClose: () => void
  onConfirm: (plan: GuidedPlan, answers: GuidedAnswers) => void
  onSaveDraft?: (workflow: GuidedWorkflow, answers: GuidedAnswers, stepIndex: number, draftId?: string) => void
  onUploadRichTextImage?: (file: File) => Promise<string>
}

export function GuidedCreateDialog({ open, workflow, resources = {}, draft = null, submitting = false, onClose, onConfirm, onSaveDraft, onUploadRichTextImage }: GuidedCreateDialogProps) {
  const [stepIndex, setStepIndex] = useState(() => draft?.stepIndex || 0)
  const [answers, setAnswers] = useState<GuidedAnswers>(() => draft?.answers || (workflow ? initialGuidedAnswers(workflow) : {}))
  const [documentEditor, setDocumentEditor] = useState<{ title: string; label: string; key: string; value: string } | null>(null)
  const activeStep = workflow?.steps[stepIndex]
  const plan = useMemo(() => workflow ? buildGuidedPlan(workflow, answers, resources) : null, [answers, resources, workflow])

  function updateAnswer(key: string, value: GuidedAnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }))
  }

  function close() {
    setStepIndex(0)
    if (workflow) {
      setAnswers(initialGuidedAnswers(workflow))
    }
    onClose()
  }

  if (!workflow || !activeStep || !plan) {
    return null
  }

  const firstStep = stepIndex === 0
  const lastStep = stepIndex === workflow.steps.length - 1

  return (
    <>
    <Sheet
      open={open}
      title={workflow.title}
      description={workflow.intent}
      onClose={close}
      className="w-[min(1040px,calc(100vw-2rem))]"
      side="right"
      suspended={Boolean(documentEditor)}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-[var(--muted-foreground)]">第 {stepIndex + 1} 步 / 共 {workflow.steps.length} 步</div>
          <div className="flex gap-2">
            <Button disabled={submitting} icon={<Save className="h-4 w-4" aria-hidden="true" />} onClick={() => onSaveDraft?.(workflow, answers, stepIndex, draft?.id)} type="button" variant="ghost">
              保存草稿
            </Button>
            <Button disabled={firstStep || submitting} icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))} type="button" variant="secondary">
              上一步
            </Button>
            {lastStep ? (
              <Button disabled={submitting} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} onClick={() => onConfirm(plan, answers)} type="button">
                {submitting ? '保存中' : '确认保存'}
              </Button>
            ) : (
              <Button disabled={submitting} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />} onClick={() => setStepIndex((current) => Math.min(current + 1, workflow.steps.length - 1))} type="button">
                下一步
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="grid min-h-[520px] gap-5 lg:grid-cols-[240px_1fr]">
        <ol className="grid content-start gap-1 border-r border-[var(--border)] pr-4">
          {workflow.steps.map((step, index) => (
            <li key={step.key}>
              <button
                aria-current={index === stepIndex ? 'step' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  index === stepIndex ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                )}
                onClick={() => setStepIndex(index)}
                type="button"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]">{index + 1}</span>
                <span>
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="block text-xs opacity-80">{step.question}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="grid content-start gap-5">
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">{workflow.intent}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">{activeStep.question}</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{activeStep.description}</p>
          </div>
          {activeStep.fields.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {activeStep.fields.map((field) => (
                <GuidedFieldControl
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  resources={resources}
                  onChange={(value) => updateAnswer(field.key, value)}
                  onOpenDocumentEditor={(request) => setDocumentEditor(request)}
                />
              ))}
            </div>
          ) : (
            <PlanSummary plan={plan} />
          )}
          {activeStep.fields.length > 0 ? <PlanPreview plan={plan} /> : null}
        </div>
      </div>
    </Sheet>
    <DocumentEditorModal
      open={Boolean(documentEditor)}
      title={documentEditor?.title || ''}
      label={documentEditor?.label || ''}
      value={documentEditor?.value || ''}
      onClose={() => setDocumentEditor(null)}
      onSave={(value) => {
        if (documentEditor) {
          updateAnswer(documentEditor.key, value)
        }
        setDocumentEditor(null)
      }}
      onUploadImage={onUploadRichTextImage}
    />
    </>
  )
}

function GuidedFieldControl({ field, value, resources, onChange, onOpenDocumentEditor }: { field: GuidedField; value: GuidedAnswerValue | undefined; resources: ResourceLookup; onChange: (value: GuidedAnswerValue) => void; onOpenDocumentEditor: (request: { title: string; label: string; key: string; value: string }) => void }) {
  const textValue = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const wide = field.type === 'textarea' || field.type === 'multiselect' || field.type === 'relation' || field.type === 'file'
  return (
    <Field label={field.label} htmlFor={`guided-${field.key}`} hint={field.required ? '必填' : undefined} className={wide ? 'md:col-span-2' : undefined}>
      {field.type === 'textarea' ? (
        <GuidedLongFormSummary
          id={`guided-${field.key}`}
          label={field.label}
          value={textValue}
          onOpen={() => onOpenDocumentEditor({ title: `编辑${field.label}`, label: field.label, key: field.key, value: textValue })}
        />
      ) : field.type === 'choice' ? (
        <Select id={`guided-${field.key}`} aria-label={field.label} value={textValue} options={field.options || []} onChange={(event) => onChange(event.target.value)} />
      ) : field.type === 'relation' ? (
        <EntityPicker
          id={`guided-${field.key}`}
          label={field.label}
          lookup={resources}
          resources={field.relation ? [field.relation] : []}
          value={textValue}
          onValueChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue[0] || '' : nextValue)}
        />
      ) : field.type === 'multiselect' ? (
        <MultiSelectField field={field} value={Array.isArray(value) ? value : []} resources={resources} onChange={onChange} />
      ) : field.type === 'file' ? (
        <FilePicker id={`guided-${field.key}`} label={field.label} value={value instanceof File ? value : textValue} accept={field.accept} onValueChange={(nextValue) => onChange(nextValue)} />
      ) : field.type === 'pendingSwitch' ? (
        <div className="flex h-10 items-center gap-3 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 shadow-sm">
          <Switch aria-label={field.label} checked={value === true} onCheckedChange={onChange} />
          <span className="text-sm text-[var(--muted-foreground)]">{value === true ? '是' : '否'}</span>
        </div>
      ) : field.type === 'datetime' ? (
        <DateTimePicker
          id={`guided-${field.key}`}
          label={field.label}
          value={textValue}
          onChange={onChange}
        />
      ) : field.key.toLowerCase().includes('location') ? (
        <LocationPicker
          id={`guided-${field.key}`}
          label={field.label}
          resources={resources}
          value={textValue}
          onValueChange={onChange}
        />
      ) : (
        <Input
          id={`guided-${field.key}`}
          aria-label={field.label}
          type={field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
          value={textValue}
          onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)}
        />
      )}
    </Field>
  )
}

function GuidedLongFormSummary({ id, label, value, onOpen }: { id: string; label: string; value: string; onOpen: () => void }) {
  const summary = summarizeHtml(value)
  return (
    <div className="rounded-md border border-[var(--input)] bg-[var(--card)] p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{label}</div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">{summary || '暂无内容，打开编辑器补充。'}</p>
        </div>
        <Button aria-label={`编辑${label}`} id={id} type="button" variant="secondary" onClick={onOpen}>
          打开编辑器
        </Button>
      </div>
    </div>
  )
}

function MultiSelectField({ field, value, resources, onChange }: { field: GuidedField; value: string[]; resources: ResourceLookup; onChange: (value: GuidedAnswerValue) => void }) {
  return <EntityPicker label={field.label} lookup={resources} multiple resources={field.relation ? [field.relation] : []} value={value} onValueChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [])} />
}

function PlanPreview({ plan }: { plan: GuidedPlan }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {plan.facts.map((fact) => <Badge key={fact.key} tone={fact.pending ? 'amber' : 'blue'}>{fact.label}: {fact.value}</Badge>)}
      </div>
      <div className="text-sm font-semibold">将保存 {plan.operations.length} 项内容</div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{plan.scenePlacements.join(' / ')}</p>
    </div>
  )
}

function PlanSummary({ plan }: { plan: GuidedPlan }) {
  return (
    <div className="grid gap-4">
      <PlanPreview plan={plan} />
      <div className="grid gap-2">
        {plan.operations.map((operation, index) => (
          <OperationTag key={`${operation.key}-${index}`} operation={operation} />
        ))}
      </div>
      {plan.warnings.length > 0 ? (
        <div className="rounded-md border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning-foreground)]">
          {plan.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      ) : null}
    </div>
  )
}

function OperationTag({ operation }: { operation: GuidedPlan['operations'][number] }) {
  const [showPayload, setShowPayload] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-sm"
      onBlur={() => setShowPayload(false)}
      onFocus={() => setShowPayload(true)}
      onMouseEnter={() => setShowPayload(true)}
      onMouseLeave={() => setShowPayload(false)}
      ref={anchorRef}
    >
      <span className="font-semibold">{operation.label}</span>
      <Badge>{operation.resource}</Badge>
      <button className="text-xs text-[var(--muted-foreground)] outline-none" type="button">
        查看详情
      </button>
      <FloatingTooltip anchorRef={anchorRef} open={showPayload}>
        <div className="mb-2 text-xs font-semibold text-[var(--foreground)]">{operation.label} · {operation.resource}</div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--muted)]/50 p-2 text-[11px] text-[var(--muted-foreground)]">{JSON.stringify(operation.payload, null, 2)}</pre>
      </FloatingTooltip>
    </div>
  )
}

function summarizeHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
