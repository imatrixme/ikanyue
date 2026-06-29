export type SemanticTone = 'brand' | 'warning' | 'info' | 'success' | 'danger' | 'neutral'

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

export const semanticToneClass: Record<SemanticTone, { surface: string; accent: string; surfaceAccent: string; icon: string; emphasis: string; badge: BadgeTone }> = {
  brand: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--brand)]',
    surfaceAccent: 'before:bg-[var(--brand)]',
    icon: 'bg-[var(--secondary)] text-[var(--foreground)]',
    emphasis: 'text-[var(--foreground)]',
    badge: 'neutral',
  },
  warning: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--warning)]',
    surfaceAccent: 'before:bg-[var(--warning)]',
    icon: 'bg-[var(--warning-soft)] text-[var(--warning-foreground)]',
    emphasis: 'text-[var(--warning-foreground)]',
    badge: 'amber',
  },
  info: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--info)]',
    surfaceAccent: 'before:bg-[var(--info)]',
    icon: 'bg-[var(--info-soft)] text-[var(--info)]',
    emphasis: 'text-[var(--info)]',
    badge: 'blue',
  },
  success: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--success)]',
    surfaceAccent: 'before:bg-[var(--success)]',
    icon: 'bg-[var(--success-soft)] text-[var(--success)]',
    emphasis: 'text-[var(--success)]',
    badge: 'green',
  },
  danger: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--destructive)]',
    surfaceAccent: 'before:bg-[var(--destructive)]',
    icon: 'bg-[var(--danger-soft)] text-[var(--destructive)]',
    emphasis: 'text-[var(--destructive)]',
    badge: 'red',
  },
  neutral: {
    surface: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
    accent: 'bg-[var(--border)]',
    surfaceAccent: 'before:bg-[var(--border)]',
    icon: 'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
    emphasis: 'text-[var(--foreground)]',
    badge: 'neutral',
  },
}

export function semanticTone(tone: SemanticTone) {
  return semanticToneClass[tone]
}
