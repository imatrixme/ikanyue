import { FileText, Save } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  booleanOptions,
  buildResourceFormState,
  buildResourcePayload,
  displayResourceField,
  resourceFormFields,
  resourceFormValueText,
  type ResourceFormField,
} from '../../app/resourceForms'
import type { OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EntityPicker } from '../ui/EntityPicker'
import { FilePicker } from '../ui/FilePicker'
import { Field, Input } from '../ui/Input'
import { LocationPicker } from '../ui/LocationPicker'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { DateTimePicker } from '../ui/DateTimePicker'
import { StepRail } from './StepSheet'

interface ResourceFormProps {
  resource: OpsResource
  record?: ResourceRecord | null
  onSubmit: (payload: Record<string, unknown>) => void
  actions?: React.ReactNode
  embedded?: boolean
  resources?: ResourceLookup
  onOpenDocumentEditor?: (request: DocumentEditorRequest) => void
  onCancel?: () => void
}

export interface DocumentEditorRequest {
  title: string
  label: string
  value: string
  onSave: (value: string) => void
}

export function ResourceForm({ resource, record, onSubmit, actions, embedded = false, resources = {}, onOpenDocumentEditor, onCancel }: ResourceFormProps) {
  const fields = useMemo(() => resourceFormFields[resource] || [], [resource])
  const initialForm = useMemo(() => buildResourceFormState(resource, record || undefined), [record, resource])
  const [form, setForm] = useState(() => initialForm)
  const { primaryFields, secondaryFields } = useMemo(() => splitFields(fields), [fields])
  const steps = useMemo(() => [
    { key: 'primary', title: '主信息', description: '先确认识别和状态' },
    ...(secondaryFields.length > 0 ? [{ key: 'details', title: '补充信息', description: '再完善时间、文件和说明' }] : []),
    { key: 'review', title: '变更一览', description: '保存前统一复核' },
  ], [secondaryFields.length])
  const [step, setStep] = useState(steps[0].key)
  const currentIndex = Math.max(steps.findIndex((item) => item.key === step), 0)
  const firstStep = currentIndex === 0
  const lastStep = currentIndex === steps.length - 1

  if (!fields.length) {
    return null
  }

  const activeFields = step === 'primary' ? primaryFields : step === 'details' ? secondaryFields : []

  function go(offset: number) {
    setStep(steps[Math.min(Math.max(currentIndex + offset, 0), steps.length - 1)].key)
  }

  function submitForm() {
    onSubmit(buildResourcePayload(resource, form))
  }

  return (
    <form
      id={`resource-form-${resource}`}
      className={embedded ? 'grid gap-5' : 'border-t border-[var(--border)] bg-[var(--muted)]/35 p-4'}
      onSubmit={(event) => {
        event.preventDefault()
        if (lastStep) {
          submitForm()
        } else {
          go(1)
        }
      }}
    >
      <div className="grid min-h-[560px] gap-5 lg:grid-cols-[220px_1fr]">
        <StepRail steps={steps} currentKey={step} onStepClick={setStep} />
        <div className="min-w-0">
          <div className="mb-4">
            <h3 className="font-semibold">{record?.id ? '编辑记录' : '新建记录'}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">{step === 'review' ? '保存前确认本次会写入的数据。' : '当前步骤只显示需要关注的字段。'}</p>
          </div>
          {step === 'review' ? (
            <ResourceChangeReview resource={resource} fields={fields} form={form} initialForm={initialForm} resources={resources} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activeFields.map((field) => (
                <ResourceFieldControl
                  key={field.key}
                  field={field}
                  resource={resource}
                  value={form[field.key]}
                  resources={resources}
                  onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                  onOpenDocumentEditor={onOpenDocumentEditor}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {actions !== undefined ? actions : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="text-xs text-[var(--muted-foreground)]">{lastStep ? '确认无误后保存，列表会刷新。' : '继续下一步前可以随时返回修改。'}</div>
          <div className="flex gap-2">
            {onCancel ? <Button type="button" variant="secondary" onClick={onCancel}>取消</Button> : null}
            <Button type="button" variant="secondary" disabled={firstStep} onClick={() => go(-1)}>上一步</Button>
            {lastStep ? (
              <Button type="submit" icon={<Save className="h-4 w-4" aria-hidden="true" />}>保存</Button>
            ) : (
              <Button type="button" onClick={() => go(1)}>下一步</Button>
            )}
          </div>
        </div>
      )}
    </form>
  )
}

function ResourceFieldControl({
  field,
  resource,
  value,
  resources,
  onChange,
  onOpenDocumentEditor,
}: {
  field: ResourceFormField
  resource: OpsResource
  value: string | File | undefined
  resources: ResourceLookup
  onChange: (value: string | File) => void
  onOpenDocumentEditor?: (request: DocumentEditorRequest) => void
}) {
  const wide = field.type === 'textarea' || field.type === 'file' || field.type === 'relation'
  return (
    <Field key={field.key} label={field.label} htmlFor={`${resource}-${field.key}`} className={wide ? 'md:col-span-2' : undefined}>
      {field.type === 'textarea' ? (
        <LongFormSummary
          id={`${resource}-${field.key}`}
          label={field.label}
          value={resourceFormValueText(value)}
          onChange={onChange}
          onOpenDocumentEditor={onOpenDocumentEditor}
        />
      ) : field.type === 'boolean' ? (
        <div className="flex h-10 items-center gap-3 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 shadow-sm">
          <Switch
            aria-label={field.label}
            checked={resourceFormValueText(value) === 'true'}
            onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
          />
          <span className="text-sm text-[var(--muted-foreground)]">{resourceFormValueText(value) === 'true' ? '是' : '否'}</span>
        </div>
      ) : field.type === 'relation' ? (
        <EntityPicker
          id={`${resource}-${field.key}`}
          label={field.label}
          value={resourceFormValueText(value)}
          resources={field.relations || (field.relation ? [field.relation] : [])}
          lookup={resources}
          onValueChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue[0] || '' : nextValue)}
        />
      ) : field.type === 'file' ? (
        <FilePicker
          id={`${resource}-${field.key}`}
          label={field.label}
          value={value || ''}
          accept={field.accept}
          onValueChange={onChange}
        />
      ) : field.type === 'select' ? (
        <Select
          id={`${resource}-${field.key}`}
          aria-label={field.label}
          value={resourceFormValueText(value)}
          options={field.options || booleanOptions}
          allowEmpty={field.allowEmpty}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'datetime' ? (
        <DateTimePicker
          id={`${resource}-${field.key}`}
          label={field.label}
          value={resourceFormValueText(value)}
          onChange={onChange}
        />
      ) : field.key.toLowerCase().includes('location') ? (
        <LocationPicker
          id={`${resource}-${field.key}`}
          label={field.label}
          value={resourceFormValueText(value)}
          resources={resources}
          onValueChange={onChange}
        />
      ) : (
        <Input
          id={`${resource}-${field.key}`}
          aria-label={field.label}
          type={field.type === 'number' ? 'number' : 'text'}
          value={resourceFormValueText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

function ResourceChangeReview({
  resource,
  fields,
  form,
  initialForm,
  resources,
}: {
  resource: OpsResource
  fields: ResourceFormField[]
  form: Record<string, string | File>
  initialForm: Record<string, string | File>
  resources: ResourceLookup
}) {
  return (
    <div className="grid gap-2">
      {fields.map((field) => {
        const current = form[field.key]
        const initial = initialForm[field.key]
        const changed = resourceFormValueText(current) !== resourceFormValueText(initial)
        return (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2" key={field.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{field.label}</div>
              <Badge tone={changed ? 'blue' : 'neutral'}>{changed ? '已变更' : '未变更'}</Badge>
            </div>
            <div className="mt-1 text-sm text-[var(--muted-foreground)]">{displayResourceField(resource, field.key, current, resources)}</div>
          </div>
        )
      })}
    </div>
  )
}

function splitFields(fields: ResourceFormField[]) {
  const primaryKeys = new Set([
    'activityId',
    'cellphone',
    'channel',
    'blocked',
    'name',
    'placement',
    'programId',
    'realName',
    'reportType',
    'scopeType',
    'sessionId',
    'status',
    'studentId',
    'teacherId',
    'templateId',
    'title',
    'type',
    'verified',
    'isAdmin',
    'role',
  ])
  const primaryFields = fields.filter((field, index) => primaryKeys.has(field.key) || index < Math.min(2, fields.length))
  const primarySet = new Set(primaryFields.map((field) => field.key))
  const secondaryFields = fields.filter((field) => !primarySet.has(field.key))
  return { primaryFields, secondaryFields }
}

function LongFormSummary({ id, label, value, onChange, onOpenDocumentEditor }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onOpenDocumentEditor?: (request: DocumentEditorRequest) => void
}) {
  const summary = summarizeHtml(value)
  function openEditor() {
    onOpenDocumentEditor?.({
      title: `编辑${label}`,
      label,
      value,
      onSave: onChange,
    })
  }
  return (
    <div className="rounded-md border border-[var(--input)] bg-[var(--card)] p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-[var(--accent-foreground)]" aria-hidden="true" />
            <span>{label}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">{summary || '暂无内容，打开编辑器补充。'}</p>
        </div>
        <Button aria-label={`编辑${label}`} id={id} type="button" variant="secondary" onClick={openEditor}>
          打开编辑器
        </Button>
      </div>
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
