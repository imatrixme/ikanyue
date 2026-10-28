import type { ReactNode } from 'react'

import { cn } from './utils'

type AlertTone = 'error' | 'info' | 'success'

const toneClass: Record<AlertTone, string> = {
  error: 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--destructive)]',
  info: 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]',
  success: 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
}

export function Alert({ tone = 'info', children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  return (
    <div className={cn('my-2 whitespace-pre-wrap rounded-md border px-3 py-2 text-sm', toneClass[tone], className)} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function ErrorText({ error }: { error: string }) {
  return error ? <Alert tone="error">{error}</Alert> : null
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-sm text-[var(--muted-foreground)]">{children}</span>
}
