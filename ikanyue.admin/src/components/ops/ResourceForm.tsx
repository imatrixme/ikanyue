import { Save } from 'lucide-react'
import { useState } from 'react'

import { buildResourceFormState, buildResourcePayload, resourceFormFields } from '../../app/resourceForms'
import type { OpsResource, ResourceRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Input'

interface ResourceFormProps {
  resource: OpsResource
  record?: ResourceRecord | null
  onSubmit: (payload: Record<string, unknown>) => void
}

export function ResourceForm({ resource, record, onSubmit }: ResourceFormProps) {
  const fields = resourceFormFields[resource] || []
  const [form, setForm] = useState(() => buildResourceFormState(resource, record || undefined))

  if (!fields.length) {
    return null
  }

  return (
    <form
      className="border-t border-[#e6ebe8] bg-[#fbfcfb] p-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(buildResourcePayload(resource, form))
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{record?.id ? '编辑记录' : '新建记录'}</h3>
          <p className="text-sm text-[#6f7880]">保存后会刷新当前资源列表。</p>
        </div>
        <Button type="submit" icon={<Save className="h-4 w-4" aria-hidden="true" />}>保存</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`${resource}-${field.key}`}>
            {field.type === 'textarea' ? (
              <textarea
                id={`${resource}-${field.key}`}
                aria-label={field.label}
                className="min-h-24 rounded-md border border-[#d8dedb] bg-white px-3 py-2 text-sm text-[#17202a] outline-none transition focus:border-[#174a5c] focus:ring-2 focus:ring-[#bdd9df]"
                value={form[field.key] || ''}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            ) : field.type === 'select' ? (
              <select
                id={`${resource}-${field.key}`}
                aria-label={field.label}
                className="h-10 rounded-md border border-[#d8dedb] bg-white px-3 text-sm text-[#17202a] outline-none transition focus:border-[#174a5c] focus:ring-2 focus:ring-[#bdd9df]"
                value={form[field.key] || ''}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                <option value="">未设置</option>
                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <Input
                id={`${resource}-${field.key}`}
                aria-label={field.label}
                type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                value={form[field.key] || ''}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
    </form>
  )
}
