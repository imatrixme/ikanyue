import { technicalValue } from '../../app/coursePresentation'

interface TechnicalDetailsProps {
  fields: Array<{ label: string; value: unknown }>
  title?: string
}

export function TechnicalDetails({ fields, title = '技术信息' }: TechnicalDetailsProps) {
  const visible = fields.filter((field) => field.value !== undefined && field.value !== null && field.value !== '')
  if (visible.length === 0) return null
  return (
    <details className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/45 p-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-[var(--muted-foreground)]">{title}</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {visible.map((field) => <div className="min-w-0" key={field.label}><dt className="text-xs text-[var(--muted-foreground)]">{field.label}</dt><dd className="mt-1 break-all whitespace-pre-wrap font-mono text-xs text-[var(--foreground)]">{technicalValue(field.value)}</dd></div>)}
      </dl>
    </details>
  )
}
