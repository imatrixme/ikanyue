import { FileText, Save } from 'lucide-react'
import { useState } from 'react'

import { booleanOptions, buildResourceFormState, buildResourcePayload, resourceFormFields, resourceFormValueText } from '../../app/resourceForms'
import type { OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { EntityPicker } from '../ui/EntityPicker'
import { FilePicker } from '../ui/FilePicker'
import { Field, Input } from '../ui/Input'
import { LocationPicker } from '../ui/LocationPicker'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { DateTimePicker } from '../ui/DateTimePicker'
import { DocumentEditorModal } from './DocumentEditorModal'

interface ResourceFormProps {
  resource: OpsResource
  record?: ResourceRecord | null
  onSubmit: (payload: Record<string, unknown>) => void
  actions?: React.ReactNode
  embedded?: boolean
  resources?: ResourceLookup
  onUploadRichTextImage?: (file: File) => Promise<string>
}

export function ResourceForm({ resource, record, onSubmit, actions, embedded = false, resources = {}, onUploadRichTextImage }: ResourceFormProps) {
  const fields = resourceFormFields[resource] || []
  const [form, setForm] = useState(() => buildResourceFormState(resource, record || undefined))

  if (!fields.length) {
    return null
  }

  return (
    <form
      id={`resource-form-${resource}`}
      className={embedded ? 'grid gap-5' : 'border-t border-[var(--border)] bg-[var(--muted)]/35 p-4'}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(buildResourcePayload(resource, form))
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{record?.id ? '编辑记录' : '新建记录'}</h3>
          <p className="text-sm text-[var(--muted-foreground)]">保存后会刷新当前资源列表。</p>
        </div>
        {actions !== undefined ? actions : <Button type="submit" icon={<Save className="h-4 w-4" aria-hidden="true" />}>保存</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => {
          const wide = field.type === 'textarea' || field.type === 'file' || field.type === 'relation'
          return (
          <Field key={field.key} label={field.label} htmlFor={`${resource}-${field.key}`} className={wide ? 'md:col-span-2' : undefined}>
            {field.type === 'textarea' ? (
              <LongFormSummary
                id={`${resource}-${field.key}`}
                label={field.label}
                value={resourceFormValueText(form[field.key])}
                onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                onUploadRichTextImage={onUploadRichTextImage}
              />
            ) : field.type === 'boolean' ? (
              <div className="flex h-10 items-center gap-3 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 shadow-sm">
                <Switch
                  aria-label={field.label}
                  checked={resourceFormValueText(form[field.key]) === 'true'}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, [field.key]: checked ? 'true' : 'false' }))}
                />
                <span className="text-sm text-[var(--muted-foreground)]">{resourceFormValueText(form[field.key]) === 'true' ? '是' : '否'}</span>
              </div>
            ) : field.type === 'relation' ? (
              <EntityPicker
                id={`${resource}-${field.key}`}
                label={field.label}
                value={resourceFormValueText(form[field.key])}
                resources={field.relations || (field.relation ? [field.relation] : [])}
                lookup={resources}
                onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: Array.isArray(value) ? value[0] || '' : value }))}
              />
            ) : field.type === 'file' ? (
              <FilePicker
                id={`${resource}-${field.key}`}
                label={field.label}
                value={form[field.key] || ''}
                accept={field.accept}
                onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
              />
            ) : field.type === 'select' ? (
              <Select
                id={`${resource}-${field.key}`}
                aria-label={field.label}
                value={resourceFormValueText(form[field.key])}
                options={field.options || booleanOptions}
                allowEmpty={field.allowEmpty}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            ) : field.type === 'datetime' ? (
              <DateTimePicker
                id={`${resource}-${field.key}`}
                label={field.label}
                value={resourceFormValueText(form[field.key])}
                onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
              />
            ) : field.key.toLowerCase().includes('location') ? (
              <LocationPicker
                id={`${resource}-${field.key}`}
                label={field.label}
                value={resourceFormValueText(form[field.key])}
                resources={resources}
                onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
              />
            ) : (
              <Input
                id={`${resource}-${field.key}`}
                aria-label={field.label}
                type={field.type === 'number' ? 'number' : 'text'}
                value={resourceFormValueText(form[field.key])}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            )}
          </Field>
          )
        })}
      </div>
    </form>
  )
}

function LongFormSummary({ id, label, value, onChange, onUploadRichTextImage }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onUploadRichTextImage?: (file: File) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const summary = summarizeHtml(value)
  return (
    <div className="rounded-md border border-[var(--input)] bg-[var(--card)] p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-cyan-700" aria-hidden="true" />
            <span>{label}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">{summary || '暂无内容，打开编辑器补充。'}</p>
        </div>
        <Button aria-label={`编辑${label}`} id={id} type="button" variant="secondary" onClick={() => setOpen(true)}>
          打开编辑器
        </Button>
      </div>
      <DocumentEditorModal
        open={open}
        title={`编辑${label}`}
        label={label}
        value={value}
        onClose={() => setOpen(false)}
        onSave={onChange}
        onUploadImage={onUploadRichTextImage}
      />
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
