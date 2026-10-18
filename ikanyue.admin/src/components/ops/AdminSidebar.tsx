import { X } from 'lucide-react'

import { navigationSections, sectionLabel, sectionOf } from '../../app/navigation'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile } from '../../app/types'
import { cn } from '../ui/utils'

interface AdminSidebarProps {
  activeView: AppView
  profile: OpsProfile
  onViewChange: (view: AppView) => void
  mode?: 'desktop' | 'drawer'
  onClose?: () => void
  onNavigate?: () => void
}

export function AdminSidebar({ activeView, profile, onViewChange, mode = 'desktop', onClose, onNavigate }: AdminSidebarProps) {
  const activeSection = sectionOf(activeView).key
  const sections = navigationSections
    .map((section) => ({ section, firstView: section.tabs.find((tab) => canAccessView(profile, tab.view))?.view }))
    .filter((entry): entry is { section: typeof entry.section; firstView: AppView } => Boolean(entry.firstView))

  return (
    <aside className={cn(
      'z-30 border-[var(--border)] bg-[var(--sidebar)]',
      mode === 'drawer'
        ? 'flex h-full w-full flex-col rounded-none border-r'
        : 'hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-52',
    )}>
      <div className="flex h-full w-full flex-col">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <p className="truncate text-sm font-semibold">看乐教学运营</p>
          {mode === 'drawer' ? (
            <button
              aria-label="关闭导航"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="后台导航">
          <div className="grid gap-0.5">
            {sections.map(({ section, firstView }) => {
              const active = activeSection === section.key
              const Icon = section.icon
              return (
                <button
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm transition-colors', active ? 'bg-[var(--secondary)] font-semibold text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]')}
                  key={section.key}
                  onClick={() => { onViewChange(firstView); onNavigate?.() }}
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{sectionLabel(section, profile)}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </aside>
  )
}
