import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'

import { cn } from './utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:bg-[var(--primary-hover)]',
  secondary: 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
  ghost: 'border-transparent bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
  danger: 'border-[var(--destructive)] bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-sm hover:bg-[var(--destructive-hover)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', icon, className, children, ...props }, ref) {
  const classes = cn(
    'inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-50',
    variantClass[variant],
    className,
  )
  const content = (
    <>
      {icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span> : null}
      {children}
    </>
  )

  return (
    <button className={classes} ref={ref} {...props}>
      {content}
    </button>
  )
})
