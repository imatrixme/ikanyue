import { Check } from 'lucide-react'

import { cn } from '../ui/utils'

export interface StepSheetStep {
  key: string
  title: string
  description: string
}

interface StepRailProps {
  steps: StepSheetStep[]
  currentKey: string
  onStepClick?: (key: string) => void
}

export function StepRail({ steps, currentKey, onStepClick }: StepRailProps) {
  const currentIndex = Math.max(steps.findIndex((step) => step.key === currentKey), 0)

  return (
    <aside className="rounded-md border border-[var(--border)] bg-[var(--muted)]/25 p-3">
      <div className="grid gap-2">
        {steps.map((step, index) => {
          const active = step.key === currentKey
          const done = index < currentIndex
          const content = (
            <>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold',
                  active && 'border-cyan-300 bg-white text-cyan-800',
                  done && 'border-emerald-200 bg-white text-emerald-700',
                  !active && !done && 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-1 block text-xs leading-5 text-inherit opacity-75">{step.description}</span>
              </span>
            </>
          )

          return onStepClick && index <= currentIndex ? (
            <button
              className={stepClass(active, done)}
              key={step.key}
              onClick={() => onStepClick(step.key)}
              type="button"
            >
              {content}
            </button>
          ) : (
            <div className={stepClass(active, done)} key={step.key}>
              {content}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function stepClass(active: boolean, done: boolean) {
  return cn(
    'grid grid-cols-[28px_1fr] gap-2 rounded-md border px-2 py-3 text-left',
    active && 'border-cyan-300 bg-cyan-50 text-cyan-950',
    done && 'border-emerald-200 bg-emerald-50 text-emerald-800',
    !active && !done && 'border-transparent text-[var(--muted-foreground)]',
  )
}
