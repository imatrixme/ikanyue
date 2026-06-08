export type SemanticTone = 'brand' | 'warning' | 'info' | 'success' | 'danger' | 'neutral'

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

export const semanticToneClass: Record<SemanticTone, { surface: string; accent: string; surfaceAccent: string; icon: string; emphasis: string; badge: BadgeTone }> = {
  brand: {
    surface: 'border-[var(--brand-border)] bg-[var(--brand-soft)]/68 text-[var(--accent-foreground)]',
    accent: 'bg-[var(--brand)]',
    surfaceAccent: 'before:bg-[var(--brand)]',
    icon: 'bg-[var(--card)] text-[var(--accent-foreground)]',
    emphasis: 'text-[var(--accent-foreground)]',
    badge: 'blue',
  },
  warning: {
    surface: 'border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--warning-foreground)]',
    accent: 'bg-[var(--warning)]',
    surfaceAccent: 'before:bg-[var(--warning)]',
    icon: 'bg-[var(--card)] text-[var(--warning-foreground)]',
    emphasis: 'text-[var(--warning-foreground)]',
    badge: 'amber',
  },
  info: {
    surface: 'border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info)]',
    accent: 'bg-[var(--info)]',
    surfaceAccent: 'before:bg-[var(--info)]',
    icon: 'bg-[var(--card)] text-[var(--info)]',
    emphasis: 'text-[var(--info)]',
    badge: 'blue',
  },
  success: {
    surface: 'border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]',
    accent: 'bg-[var(--success)]',
    surfaceAccent: 'before:bg-[var(--success)]',
    icon: 'bg-[var(--card)] text-[var(--success)]',
    emphasis: 'text-[var(--success)]',
    badge: 'green',
  },
  danger: {
    surface: 'border-[var(--destructive)]/25 bg-[var(--danger-soft)] text-[var(--destructive)]',
    accent: 'bg-[var(--destructive)]',
    surfaceAccent: 'before:bg-[var(--destructive)]',
    icon: 'bg-[var(--card)] text-[var(--destructive)]',
    emphasis: 'text-[var(--destructive)]',
    badge: 'red',
  },
  neutral: {
    surface: 'border-[var(--border)] bg-[var(--secondary)]/65 text-[var(--secondary-foreground)]',
    accent: 'bg-[var(--border)]',
    surfaceAccent: 'before:bg-[var(--border)]',
    icon: 'bg-[var(--card)] text-[var(--secondary-foreground)]',
    emphasis: 'text-[var(--foreground)]',
    badge: 'neutral',
  },
}

export function semanticTone(tone: SemanticTone) {
  return semanticToneClass[tone]
}
