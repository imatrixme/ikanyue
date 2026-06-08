import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { Badge } from './Badge'
import { semanticTone, type SemanticTone } from './semanticTone'
import { cn } from './utils'

interface SemanticSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SemanticTone
  insetAccent?: boolean
}

export function SemanticSurface({ tone = 'neutral', insetAccent = true, className, children, ...props }: SemanticSurfaceProps) {
  const colors = semanticTone(tone)
  return (
    <div className={cn('relative overflow-hidden rounded-md border p-4 shadow-sm', colors.surface, insetAccent && 'pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full', insetAccent && colors.surfaceAccent, className)} {...props}>
      {children}
    </div>
  )
}

interface ActionTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string
  description: string
  actionLabel: string
  actionIcon?: ReactNode
  badge?: string
  icon?: ReactNode
  tone?: SemanticTone
}

export function ActionTile({ title, description, actionLabel, actionIcon, badge, icon, tone = 'brand', className, ...props }: ActionTileProps) {
  const colors = semanticTone(tone)
  return (
    <button
      className={cn(
        'group relative min-h-36 overflow-hidden rounded-md border bg-[var(--card)] p-4 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-50',
        colors.surface,
        className,
      )}
      type="button"
      {...props}
    >
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', colors.accent)} />
      <span className="flex items-start justify-between gap-3">
        {icon ? <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/10 shadow-sm transition group-hover:scale-[1.03]', colors.icon)}>{icon}</span> : null}
        {badge ? <Badge tone={colors.badge}>{badge}</Badge> : null}
      </span>
      <span className="mt-4 block min-w-0 font-semibold leading-5 text-[var(--foreground)] [overflow-wrap:anywhere]">{title}</span>
      <span className="mt-1 block min-h-10 text-sm leading-5 text-[var(--muted-foreground)] [overflow-wrap:anywhere]">{description}</span>
      <span className={cn('mt-3 inline-flex items-center gap-1 text-xs font-semibold transition group-hover:translate-x-0.5', colors.emphasis)}>
        {actionLabel}
        {actionIcon}
      </span>
    </button>
  )
}

interface MetricTileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  label: string
  value: number
  hint?: string
  icon?: ReactNode
  onClick?: () => void
  tone?: SemanticTone
}

export function MetricTile({ label, value, hint, icon, onClick, tone = 'neutral', className, ...props }: MetricTileProps) {
  const colors = semanticTone(tone)
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-[var(--muted-foreground)]">{label}</span>
        {icon ? <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md', colors.icon)}>{icon}</span> : null}
      </div>
      <div className="mt-3 truncate text-3xl font-semibold tabular-nums text-[var(--foreground)]">{formatMetricValue(value)}</div>
      {hint ? <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{hint}</div> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        className={cn('min-w-0 rounded-md border bg-[var(--card)] p-4 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]', colors.surface, className)}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    )
  }

  return (
    <div className={cn('min-w-0 rounded-md border bg-[var(--card)] p-4 shadow-sm', colors.surface, className)} {...props}>
      {content}
    </div>
  )
}

function formatMetricValue(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)
}
