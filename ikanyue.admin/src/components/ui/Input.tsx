import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

interface FieldProps {
  label: string
  children: ReactNode
  htmlFor?: string
  hint?: string
  className?: string
}

export function Field({ label, children, htmlFor, hint, className }: FieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="min-h-4 text-xs text-[var(--muted-foreground)]">{hint}</p> : <span aria-hidden="true" className="min-h-4" />}
    </div>
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium leading-none text-[var(--foreground)]', className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 min-w-0 w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
