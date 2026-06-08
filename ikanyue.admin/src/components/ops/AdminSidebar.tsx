import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'

import { navGroups } from '../../app/resourceConfig'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile } from '../../app/types'
import { cn } from '../ui/utils'

interface AdminSidebarProps {
  activeView: AppView
  profile: OpsProfile
  onViewChange: (view: AppView) => void
}

export function AdminSidebar({ activeView, profile, onViewChange }: AdminSidebarProps) {
  const [expanded, setExpanded] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessView(profile, item.view)),
    }))
    .filter((group) => group.items.length > 0)

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }))
  }

  function toggleSection(groupKey: string, sectionLabel: string) {
    const key = getSectionKey(groupKey, sectionLabel)
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <aside className={cn(
      'z-30 border-b border-[var(--border)] bg-[var(--sidebar)] transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:border-b-0 lg:border-r',
      expanded ? 'lg:w-64' : 'lg:w-16',
    )}>
      <div className="flex h-full flex-col">
        <div className={cn('flex h-16 items-center border-b border-[var(--border)] px-3', expanded ? 'gap-3' : 'lg:justify-center lg:px-2')}>
          <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm', !expanded && 'lg:hidden')}>KY</span>
          <div className={cn('min-w-0 flex-1 whitespace-nowrap transition-opacity', expanded ? 'opacity-100' : 'lg:hidden')}>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">KanYue Ops</p>
            <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">声乐教务生命周期</p>
          </div>
          <button
            aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] lg:inline-flex"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? <PanelLeftClose className="h-4 w-4" aria-hidden="true" /> : <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="后台导航">
          <div className="grid gap-2.5">
            {visibleGroups.map((group) => {
              const collapsed = collapsedGroups[group.key] === true
              const sectionGroups = groupItemsBySection(group.items)
              return (
              <section key={group.key} className="grid gap-1">
                <button
                  aria-expanded={!collapsed}
                  className={cn(
                    'flex h-7 w-full items-center gap-1.5 rounded pl-2 pr-1 text-left text-[13px] font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                    !expanded && 'lg:justify-center lg:px-0',
                  )}
                  onClick={() => toggleGroup(group.key)}
                  title={group.label}
                  type="button"
                >
                  {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronLeft className="h-3 w-3 shrink-0 -rotate-90" aria-hidden="true" />}
                  <span className={cn('whitespace-nowrap transition-opacity', expanded ? 'opacity-100' : 'lg:hidden')}>{group.label}</span>
                </button>
                {collapsed ? null : sectionGroups.map((section) => {
                  const sectionCollapsed = section.label ? collapsedSections[getSectionKey(group.key, section.label)] === true : false
                  return (
                    <div
                      key={section.label || 'default'}
                      className={cn(
                        'grid gap-0.5',
                        expanded && 'ml-4 border-l border-[var(--border)]/80 pl-3',
                      )}
                    >
                      {section.label && expanded ? (
                        <button
                          aria-expanded={!sectionCollapsed}
                          className="flex h-6 w-full items-center gap-1.5 rounded pl-1 pr-1 text-left text-[11px] font-medium text-[var(--muted-foreground)]/75 transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                          onClick={() => toggleSection(group.key, section.label)}
                          type="button"
                        >
                          {sectionCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronLeft className="h-3 w-3 shrink-0 -rotate-90" aria-hidden="true" />}
                          <span className="whitespace-nowrap">{section.label}</span>
                        </button>
                      ) : null}
                      {sectionCollapsed ? null : section.items.map((item) => {
                        const Icon = item.icon
                        const active = activeView === item.view
                        return (
                          <button
                            key={item.view}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'relative ml-3 flex h-6 w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md pl-2 pr-1 text-left text-[9px] font-medium transition-colors',
                              !expanded && 'lg:justify-center lg:px-0',
                              active ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm before:absolute before:-left-[25px] before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                            )}
                            onClick={() => onViewChange(item.view)}
                            title={item.label}
                            type="button"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className={cn('whitespace-nowrap transition-opacity', expanded ? 'opacity-100' : 'lg:hidden')}>
                              {item.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </section>
              )
            })}
          </div>
        </nav>
      </div>
    </aside>
  )
}

function getSectionKey(groupKey: string, sectionLabel: string) {
  return `${groupKey}:${sectionLabel || 'default'}`
}

function groupItemsBySection<T extends { section?: string }>(items: T[]) {
  return items.reduce<Array<{ label: string; items: T[] }>>((groups, item) => {
    const label = item.section || ''
    const group = groups.find((candidate) => candidate.label === label)
    if (group) {
      group.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
    return groups
  }, [])
}
