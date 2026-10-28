import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from './utils'

const controlClass = 'min-w-0 w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15 disabled:cursor-not-allowed disabled:opacity-50'

interface FieldProps {
  label: string
  children: ReactNode
  hint?: ReactNode
  // group is for several controls (checkbox lists, nested forms), which a
  // single <label> must not wrap.
  group?: boolean
}

// Field wraps a control in its label, so the control needs no id.
export function Field({ label, children, hint, group }: FieldProps) {
  const body = (
    <>
      <span className="pt-2 text-xs font-medium text-[var(--foreground)]">{label}</span>
      <span className="grid gap-1">
        {children}
        {hint ? <span className="text-xs text-[var(--muted-foreground)]">{hint}</span> : null}
      </span>
    </>
  )
  const layout = 'grid gap-1.5 md:grid-cols-[10rem_1fr] md:items-start'
  return group
    ? <div aria-label={label} className={layout} role="group">{body}</div>
    : <label className={layout}>{body}</label>
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24 py-2 font-mono text-xs', className)} {...props} />
}

export interface Option {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[]
  placeholder?: string
}

export function Select({ options, placeholder = '请选择', className, ...props }: SelectProps) {
  return (
    <select className={cn(controlClass, 'h-9', className)} {...props}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <input className="h-4 w-4 accent-[var(--primary)]" type="checkbox" {...props} />
      {label}
    </label>
  )
}
