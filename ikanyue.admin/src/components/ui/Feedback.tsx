import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

type AlertTone = 'error' | 'info' | 'success' | 'warning'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  title?: string
  tone?: AlertTone
}

const toneClass: Record<AlertTone, string> = {
  error: 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--destructive)]',
  info: 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]',
  success: 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'border-[var(--point-border)] bg-[var(--warning-soft)] text-[var(--warning-foreground)]',
}

const toneIcon = {
  error: AlertCircle,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
}

export function Alert({ children, className, title, tone = 'info', ...props }: AlertProps) {
  const Icon = toneIcon[tone]
  return (
    <div className={cn('flex gap-3 rounded-md border px-3 py-3 text-sm', toneClass[tone], className)} role={tone === 'error' ? 'alert' : 'status'} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-1 text-[var(--foreground)]' : ''}>{children}</div>
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded bg-[var(--muted)]', className)} />
}

export function ToastMessage({ children, tone = 'info' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  return <Alert className="shadow-sm" tone={tone}>{children}</Alert>
}
