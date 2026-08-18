import { X } from 'lucide-react'

import { businessIcons } from '../../app/businessIcons'
import { navigationGroups } from '../../app/navigation'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile } from '../../app/types'
import { BusinessIcon } from '../ui/BusinessIcon'
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
  const visibleGroups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessView(profile, item.view)) }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className={cn(
      'z-30 border-[var(--border)] bg-[var(--sidebar)] transition-all duration-200',
      mode === 'drawer'
        ? 'flex h-full w-full flex-col rounded-none border-r'
        : 'hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:overflow-hidden',
    )}>
      <div className="flex h-full w-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--brand-wash)] px-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--brand-border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm">
            <BusinessIcon className="h-8 w-8" src={businessIcons.book} />
          </span>
          <div className="min-w-0 flex-1 whitespace-nowrap">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">看乐艺术</p>
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">教学运营中心</p>
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
          <div className="grid gap-5">
            {visibleGroups.map((group) => (
              <section key={group.label}>
                <p className="px-3 pb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">{group.label}</p>
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const active = activeView === item.view
                    const label = item.view === 'calendar' && !profile.isAdmin && !(profile.courseCreditCapabilities || []).includes('course_credit.academic') ? '我的课表' : item.label
                    return <button key={item.view} aria-current={active ? 'page' : undefined} className={cn('relative flex min-h-12 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors', active ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--accent-foreground)]')} onClick={() => { onViewChange(item.view); onNavigate?.() }} type="button"><span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md', active ? 'bg-[var(--primary-foreground)]' : 'bg-[var(--card)]')}><BusinessIcon src={item.icon} /></span><span>{label}</span></button>
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  )
}
