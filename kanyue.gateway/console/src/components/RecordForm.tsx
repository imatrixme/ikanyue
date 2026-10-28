import { useState, type FormEvent, type ReactNode } from 'react'

import { errorText, listRecords } from '../lib/api'
import { useResource } from '../lib/useResource'
import { Button } from './ui/Button'
import { Checkbox, Field, Input, Select, Textarea, type Option } from './ui/Controls'
import { ErrorText, Muted } from './ui/Feedback'
import { Panel } from './ui/Panel'

export type Values = Record<string, unknown>

export interface CustomFieldProps {
  value: unknown
  values: Values
  onChange: (value: unknown) => void
}

// FieldSpec declares one form field. Secrets are write-only: the form never
// shows a stored value and leaves it unchanged when the input stays empty.
export interface FieldSpec {
  name: string
  label: string
  hint?: ReactNode
  kind: 'text' | 'number' | 'bool' | 'select' | 'lines' | 'secret' | 'relation' | 'relations' | 'custom'
  options?: Option[]
  collection?: string
  visible?: (values: Values) => boolean
  // resets gives fields that start over when this one changes, e.g. the
  // selected operations when a route switches service.
  resets?: Values
  render?: (props: CustomFieldProps) => ReactNode
}

function initial(fields: FieldSpec[], record: Values | undefined, defaults: Values): Values {
  const values: Values = {}
  for (const field of fields) {
    const raw = record ? record[field.name] : defaults[field.name]
    if (field.kind === 'secret') values[field.name] = ''
    else if (field.kind === 'lines') values[field.name] = Array.isArray(raw) ? raw.join('\n') : ''
    else if (field.kind === 'number') values[field.name] = raw === undefined || raw === null ? '' : String(raw)
    else if (field.kind === 'relations') values[field.name] = Array.isArray(raw) ? raw : []
    else if (field.kind === 'bool') values[field.name] = Boolean(raw)
    else values[field.name] = raw ?? (field.kind === 'custom' ? undefined : '')
  }
  return values
}

// toBody converts form values back to the record's API shape.
function toBody(fields: FieldSpec[], values: Values): Values {
  const body: Values = {}
  for (const field of fields) {
    const value = values[field.name]
    if (field.kind === 'secret') {
      if (value) body[field.name] = value
    } else if (field.kind === 'lines') {
      body[field.name] = String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    } else if (field.kind === 'number') {
      body[field.name] = value === '' ? 0 : Number(value)
    } else if (value !== undefined) {
      body[field.name] = value
    }
  }
  return body
}

function RelationInput({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (value: unknown) => void }) {
  const collection = field.collection ?? ''
  const options = useResource(collection, () => listRecords(collection, 'fields=id,name&sort=name'))
  if (options.error) return <ErrorText error={options.error} />
  const items = (options.data ?? []).map((record) => ({ value: record.id, label: String(record.name) }))
  if (field.kind === 'relation') {
    return <Select onChange={(event) => onChange(event.target.value)} options={items} value={String(value ?? '')} />
  }
  const chosen = new Set(Array.isArray(value) ? (value as string[]) : [])
  if (items.length === 0) return <Muted>{options.loading ? '加载中…' : '暂无可选项'}</Muted>
  return (
    <span className="flex flex-wrap gap-3">
      {items.map((item) => (
        <Checkbox
          checked={chosen.has(item.value)}
          key={item.value}
          label={item.label}
          onChange={(event) => {
            const next = new Set(chosen)
            if (event.target.checked) next.add(item.value)
            else next.delete(item.value)
            onChange([...next])
          }}
        />
      ))}
    </span>
  )
}

function FieldInput({ field, values, onChange, editing }: { field: FieldSpec; values: Values; onChange: (value: unknown) => void; editing: boolean }) {
  const value = values[field.name]
  switch (field.kind) {
    case 'bool':
      return <Checkbox checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    case 'number':
      return <Input onChange={(event) => onChange(event.target.value)} step="any" type="number" value={String(value)} />
    case 'select':
      return <Select onChange={(event) => onChange(event.target.value)} options={field.options ?? []} value={String(value)} />
    case 'lines':
      return <Textarea onChange={(event) => onChange(event.target.value)} value={String(value)} />
    case 'secret':
      return (
        <Input
          autoComplete="new-password"
          onChange={(event) => onChange(event.target.value)}
          placeholder={editing ? '已加密保存；留空则不修改' : ''}
          type="password"
          value={String(value)}
        />
      )
    case 'relation':
    case 'relations':
      return <RelationInput field={field} onChange={onChange} value={value} />
    case 'custom':
      return <>{field.render?.({ value, values, onChange })}</>
    default:
      return <Input onChange={(event) => onChange(event.target.value)} value={String(value ?? '')} />
  }
}

interface RecordFormProps {
  title: string
  fields: FieldSpec[]
  record?: Values
  defaults?: Values
  onSubmit: (body: Values) => Promise<void>
  onCancel: () => void
}

export function RecordForm({ title, fields, record, defaults = {}, onSubmit, onCancel }: RecordFormProps) {
  const [values, setValues] = useState(() => initial(fields, record, defaults))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const visible = fields.filter((field) => !field.visible || field.visible(values))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit(toBody(visible, values))
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="mb-4">
      <form className="grid gap-3" onSubmit={submit}>
        <h2 className="text-sm font-semibold">{title}</h2>
        {visible.map((field) => (
          <Field group={field.kind === 'relations' || field.kind === 'custom'} hint={field.hint} key={field.name} label={field.label}>
            <FieldInput
              editing={Boolean(record)}
              field={field}
              onChange={(value) => setValues((prev) => ({ ...prev, ...field.resets, [field.name]: value }))}
              values={values}
            />
          </Field>
        ))}
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button disabled={saving} type="submit" variant="primary">保存</Button>
          <Button onClick={onCancel}>取消</Button>
        </div>
      </form>
    </Panel>
  )
}
