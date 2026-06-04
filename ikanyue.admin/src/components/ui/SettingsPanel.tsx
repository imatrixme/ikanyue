import type { ReactNode } from 'react'

import { Badge } from './Badge'
import { cn } from './utils'

interface SettingsPanelProps {
  title: string
  description: string
  icon: ReactNode
  status?: string
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
  children: ReactNode
}

export function SettingsPanel({ title, description, icon, status, tone = 'neutral', children }: SettingsPanelProps) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--card-foreground)] shadow-sm shadow-slate-200/60">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] shadow-sm">{icon}</span>
          <div>
            <h3 className="font-semibold tracking-tight text-[var(--foreground)]">{title}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
          </div>
        </div>
        {status ? <Badge tone={tone}>{status}</Badge> : null}
      </div>
      <dl className="grid gap-3">{children}</dl>
    </section>
  )
}

interface SettingLineProps {
  label: string
  value: string
  hint?: string
  muted?: boolean
}

export function SettingLine({ label, value, hint, muted }: SettingLineProps) {
  return (
    <div className="grid gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2">
      <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
      <dd className={cn('text-sm font-medium text-[var(--foreground)]', muted && 'text-[var(--muted-foreground)]')}>{value}</dd>
      {hint ? <dd className="text-xs text-[var(--muted-foreground)]">{hint}</dd> : null}
    </div>
  )
}
