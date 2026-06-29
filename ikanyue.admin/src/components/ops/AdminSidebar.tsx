import { Gift, ListChecks, PackageOpen, X } from 'lucide-react'

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

const navItems: Array<{ view: AppView; label: string; icon: typeof ListChecks }> = [
  { view: 'points', label: '积分操作', icon: ListChecks },
  { view: 'rewards', label: '实物列表', icon: PackageOpen },
]

export function AdminSidebar({ activeView, profile, onViewChange, mode = 'desktop', onClose, onNavigate }: AdminSidebarProps) {
  const visibleItems = navItems.filter((item) => canAccessView(profile, item.view))

  return (
    <aside className={cn(
      'z-30 border-[var(--border)] bg-[var(--sidebar)] transition-all duration-200',
      mode === 'drawer'
        ? 'flex h-full w-full flex-col rounded-none border-r'
        : 'hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:overflow-hidden',
    )}>
      <div className="flex h-full w-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] bg-gradient-to-r from-[var(--brand-soft)]/65 to-transparent px-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--brand-border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm shadow-[var(--brand)]/20">
            <Gift className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 whitespace-nowrap">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">KanYue Points</p>
            <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">积分兑换轻量后台</p>
          </div>
          {mode === 'drawer' ? (
            <button
              aria-label="关闭导航"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto p-2.5" aria-label="后台导航">
          <div className="grid gap-1">
            {visibleItems.map((item) => {
              const Icon = item.icon
              const active = activeView === item.view
              return (
                <button
                  key={item.view}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors',
                    active
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm shadow-[var(--brand)]/20'
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--accent-foreground)]',
                  )}
                  onClick={() => {
                    onViewChange(item.view)
                    onNavigate?.()
                  }}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </aside>
  )
}
