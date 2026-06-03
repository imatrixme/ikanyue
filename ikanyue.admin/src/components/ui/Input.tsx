import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

interface FieldProps {
  label: string
  children: ReactNode
  htmlFor?: string
  hint?: string
}

export function Field({ label, children, htmlFor, hint }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-[#6f7880]">{hint}</p> : null}
    </div>
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-semibold uppercase tracking-[0.08em] text-[#6f7880]', className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 rounded-md border border-[#d8dedb] bg-white px-3 text-sm text-[#17202a] outline-none transition focus:border-[#174a5c] focus:ring-2 focus:ring-[#bdd9df]',
        className,
      )}
      {...props}
    />
  )
}
