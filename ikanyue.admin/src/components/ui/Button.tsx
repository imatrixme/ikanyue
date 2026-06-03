import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-[#174a5c] text-white hover:bg-[#103847] border-[#174a5c]',
  secondary: 'bg-white text-[#17202a] hover:bg-[#f7faf9] border-[#d8dedb]',
  ghost: 'bg-transparent text-[#39434d] hover:bg-[#e9eee9] border-transparent',
  danger: 'bg-[#7c2d2d] text-white hover:bg-[#612323] border-[#7c2d2d]',
}

export function Button({ variant = 'primary', icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d29a2e] disabled:opacity-55',
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span> : null}
      {children}
    </button>
  )
}
