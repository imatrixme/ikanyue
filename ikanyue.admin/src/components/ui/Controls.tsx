import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

import { Button } from './Button'
import { cn } from './utils'

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[calc(100%+0.375rem)] z-30 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--foreground)] px-2 py-1 text-xs text-[var(--background)] shadow-md group-hover:block group-focus-within:block">
        {label}
      </span>
    </span>
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function IconButton({ className, icon, label, variant = 'secondary', ...props }: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <Button aria-label={label} className={cn('h-9 w-9 shrink-0 px-0', className)} icon={icon} title={label} variant={variant} {...props} />
    </Tooltip>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('min-h-24 w-full resize-y rounded-md border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15 disabled:cursor-not-allowed disabled:opacity-[var(--ky-disabled-opacity)]', className)}
      {...props}
    />
  )
}

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  description?: string
  label: string
}

export function Checkbox({ className, description, label, ...props }: ChoiceProps) {
  return (
    <label className={cn('flex items-start gap-3 text-sm', className)}>
      <input className="mt-0.5 h-4 w-4 accent-[var(--primary)]" type="checkbox" {...props} />
      <span><span className="font-medium">{label}</span>{description ? <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{description}</span> : null}</span>
    </label>
  )
}

export function Switch({ checked, className, description, disabled, label, onChange, ...props }: ChoiceProps) {
  return (
    <label className={cn('flex items-center justify-between gap-4 text-sm', disabled && 'opacity-[var(--ky-disabled-opacity)]', className)}>
      <span><span className="font-medium">{label}</span>{description ? <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{description}</span> : null}</span>
      <span className="relative inline-flex shrink-0">
        <input checked={checked} className="peer sr-only" disabled={disabled} onChange={onChange} role="switch" type="checkbox" {...props} />
        <span className="h-6 w-11 rounded-full bg-[var(--input)] transition-colors peer-checked:bg-[var(--primary)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]" />
        <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-[var(--primary-foreground)] shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

interface SegmentOption<T extends string> { label: string; value: T }

export function SegmentedControl<T extends string>({ label, onChange, options, value }: { label: string; onChange: (value: T) => void; options: SegmentOption<T>[]; value: T }) {
  return (
    <div aria-label={label} className="grid grid-flow-col auto-cols-fr rounded-md border border-[var(--border)] bg-[var(--muted)] p-1 text-sm font-medium" role="group">
      {options.map((option) => (
        <button
          aria-label={`切换到${option.label}`}
          aria-pressed={option.value === value}
          className={cn('min-h-8 rounded px-3 py-1.5 text-[var(--muted-foreground)] transition-colors', option.value === value && 'bg-[var(--card)] text-[var(--foreground)] shadow-sm')}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function FormMessage({ children, tone = 'muted' }: { children: ReactNode; tone?: 'error' | 'muted' | 'success' }) {
  const className = tone === 'error' ? 'text-[var(--destructive)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'
  return <p className={cn('text-xs font-medium', className)}>{children}</p>
}
