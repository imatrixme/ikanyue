import { ChevronDown, X } from 'lucide-react'
import { useState } from 'react'

import { foldsNavigation, navigationSections, sectionLabel, sectionOf, type NavigationSection } from '../../app/navigation'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile } from '../../app/types'
import { cn } from '../ui/utils'

const MORE_OPEN_KEY = 'kanyue.admin.nav-more-open.v1'

interface AdminSidebarProps {
  activeView: AppView
  profile: OpsProfile
  onViewChange: (view: AppView) => void
  mode?: 'desktop' | 'drawer'
  onClose?: () => void
  onNavigate?: () => void
}

export function AdminSidebar({ activeView, profile, onViewChange, mode = 'desktop', onClose, onNavigate }: AdminSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(readMoreOpen)
  const activeSection = sectionOf(activeView).key
  const sections = navigationSections
    .map((section) => ({ section, firstView: section.tabs.find((tab) => canAccessView(profile, tab.view))?.view }))
    .filter((entry): entry is { section: NavigationSection; firstView: AppView } => Boolean(entry.firstView))
  const folds = foldsNavigation(profile)
  const primary = folds ? sections.filter(({ section }) => !section.folded) : sections
  const folded = folds ? sections.filter(({ section }) => section.folded) : []
  // A collapsed 更多 still shows the section you are in, so deep links never lose their place.
  const visibleFolded = moreOpen ? folded : folded.filter(({ section }) => section.key === activeSection)

  function toggleMore() {
    const next = !moreOpen
    setMoreOpen(next)
    try { window.localStorage.setItem(MORE_OPEN_KEY, next ? '1' : '0') } catch { /* storage unavailable: keep in-memory state */ }
  }

  function renderSection({ section, firstView }: { section: NavigationSection; firstView: AppView }) {
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
  }

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
            {primary.map(renderSection)}
          </div>
          {folded.length ? (
            <div className="mt-3 grid gap-0.5 border-t border-[var(--border)] pt-3">
              <button
                aria-expanded={moreOpen}
                className="flex min-h-10 w-full items-center justify-between gap-2.5 rounded-md px-3 text-left text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                onClick={toggleMore}
                type="button"
              >
                <span>更多</span>
                <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform', moreOpen && 'rotate-180')} />
              </button>
              {visibleFolded.map(renderSection)}
            </div>
          ) : null}
        </nav>
      </div>
    </aside>
  )
}

function readMoreOpen() {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(MORE_OPEN_KEY) === '1' } catch { return false }
}
