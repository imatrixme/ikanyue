import { useState } from 'react'

import { Checkbox, Field, Input, Select, Textarea } from './ui/Controls'
import { Muted } from './ui/Feedback'

export interface JSONSchema {
  type?: string
  enum?: unknown[]
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
}

type Config = Record<string, unknown>

interface SchemaFormProps {
  schema: JSONSchema
  value: Config
  onChange: (value: Config) => void
}

const isStringList = (prop: JSONSchema) => prop.type === 'array' && prop.items?.type === 'string'

// SchemaForm renders a plugin's configuration from its JSON Schema: scalars,
// enums and string lists get their own inputs, anything nested is edited as
// JSON. The server validates the result again when the config is published.
export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
  const properties = Object.entries(schema.properties ?? {})
  if (properties.length === 0) return <Muted>该插件无需配置</Muted>
  const required = new Set(schema.required ?? [])
  const set = (name: string, next: unknown) => {
    const out = { ...value }
    if (next === undefined) delete out[name]
    else out[name] = next
    onChange(out)
  }
  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] p-3">
      {properties.map(([name, prop]) => (
        <Field hint={prop.description} key={name} label={required.has(name) ? `${name} *` : name}>
          <SchemaInput onChange={(next) => set(name, next)} prop={prop} value={value[name]} />
        </Field>
      ))}
    </div>
  )
}

function SchemaInput({ prop, value, onChange }: { prop: JSONSchema; value: unknown; onChange: (value: unknown) => void }) {
  if (prop.enum) {
    const options = prop.enum.map((item) => ({ value: JSON.stringify(item), label: String(item) }))
    return (
      <Select
        onChange={(event) => onChange(event.target.value === '' ? undefined : JSON.parse(event.target.value))}
        options={options}
        placeholder="默认"
        value={value === undefined ? '' : JSON.stringify(value)}
      />
    )
  }
  if (prop.type === 'boolean') return <Checkbox checked={Boolean(value)} onChange={(event) => onChange(event.target.checked || undefined)} />
  if (prop.type === 'integer' || prop.type === 'number') {
    return (
      <Input
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        step={prop.type === 'integer' ? 1 : 'any'}
        type="number"
        value={value === undefined ? '' : String(value)}
      />
    )
  }
  if (prop.type === 'string') return <Input onChange={(event) => onChange(event.target.value || undefined)} value={String(value ?? '')} />
  if (isStringList(prop)) return <LinesInput onChange={onChange} value={value} />
  return <JSONInput onChange={onChange} value={value} />
}

// The text inputs below keep their own draft so typing (a newline, half-written
// JSON) is not normalised away mid-edit.

function LinesInput({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(() => (Array.isArray(value) ? value.join('\n') : ''))
  return (
    <Textarea
      onChange={(event) => {
        setDraft(event.target.value)
        const lines = event.target.value.split('\n').map((line) => line.trim()).filter(Boolean)
        onChange(lines.length ? lines : undefined)
      }}
      placeholder="每行一项"
      value={draft}
    />
  )
}

function JSONInput({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)))
  const [invalid, setInvalid] = useState(false)
  return (
    <>
      <Textarea
        aria-invalid={invalid}
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim() === '') {
            setInvalid(false)
            onChange(undefined)
            return
          }
          try {
            onChange(JSON.parse(event.target.value))
            setInvalid(false)
          } catch {
            setInvalid(true)
          }
        }}
        placeholder="JSON"
        value={draft}
      />
      {invalid ? <span className="text-xs text-[var(--destructive)]">JSON 格式不正确，保存的是上一次有效的值</span> : null}
    </>
  )
}
