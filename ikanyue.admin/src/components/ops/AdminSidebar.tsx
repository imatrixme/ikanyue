import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useState } from 'react'

import { navGroups } from '../../app/resourceConfig'
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
  const [expanded, setExpanded] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessView(profile, item.view)),
    }))
    .filter((group) => group.items.length > 0)
  const activeGroup = visibleGroups.find((group) => group.items.some((item) => item.view === activeView))
  const labelsVisible = mode === 'drawer' || expanded

  function toggleGroup(key: string) {
    const defaultCollapsed = key !== activeGroup?.key
    setCollapsedGroups((current) => ({ ...current, [key]: !(current[key] ?? defaultCollapsed) }))
  }

  function toggleSection(groupKey: string, sectionLabel: string) {
    const key = getSectionKey(groupKey, sectionLabel)
    const defaultCollapsed = false
    setCollapsedSections((current) => ({ ...current, [key]: !(current[key] ?? defaultCollapsed) }))
  }

  function groupCollapsed(groupKey: string) {
    return collapsedGroups[groupKey] ?? groupKey !== activeGroup?.key
  }

  function sectionCollapsed(groupKey: string, sectionLabel: string) {
    return collapsedSections[getSectionKey(groupKey, sectionLabel)] ?? false
  }

  return (
    <aside className={cn(
      'z-30 border-[var(--border)] bg-[var(--sidebar)] transition-all duration-200',
      mode === 'drawer'
        ? 'flex h-full w-full flex-col rounded-none border-r'
        : 'hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-hidden',
      mode === 'desktop' && (expanded ? 'lg:w-64' : 'lg:w-16'),
    )}>
      <div className="flex h-full flex-col">
        <div className={cn('flex h-16 items-center border-b border-[var(--border)] px-3', labelsVisible ? 'gap-3' : 'lg:justify-center lg:px-2')}>
          <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm', !labelsVisible && 'lg:hidden')}>KY</span>
          <div className={cn('min-w-0 flex-1 whitespace-nowrap transition-opacity', labelsVisible ? 'opacity-100' : 'lg:hidden')}>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">KanYue Ops</p>
            <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">声乐教务生命周期</p>
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
          ) : (
            <button
              aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] lg:inline-flex"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? <PanelLeftClose className="h-4 w-4" aria-hidden="true" /> : <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2.5" aria-label="后台导航">
          <div className="grid gap-2">
            {visibleGroups.map((group) => {
              const collapsed = groupCollapsed(group.key)
              const sectionGroups = groupItemsBySection(group.items)
              const GroupIcon = group.icon
              return (
              <section key={group.key} className="grid gap-1">
                <button
                  aria-expanded={!collapsed}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                    activeGroup?.key === group.key && 'bg-[var(--secondary)]/70 text-[var(--foreground)]',
                    !labelsVisible && 'lg:justify-center lg:px-0',
                  )}
                  onClick={() => toggleGroup(group.key)}
                  title={group.label}
                  type="button"
                >
                  {GroupIcon ? <GroupIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  <span className={cn('min-w-0 flex-1 whitespace-nowrap transition-opacity', labelsVisible ? 'opacity-100' : 'lg:hidden')}>{group.label}</span>
                  <span className={cn(labelsVisible ? 'inline-flex' : 'lg:hidden')}>
                    {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronLeft className="h-3.5 w-3.5 shrink-0 -rotate-90" aria-hidden="true" />}
                  </span>
                </button>
                {collapsed ? null : sectionGroups.map((section) => {
                  const sectionKey = getSectionKey(group.key, section.label)
                  const isSectionCollapsed = section.label ? sectionCollapsed(group.key, section.label) : false
                  return (
                    <div
                      key={sectionKey}
                      className={cn(
                        'grid gap-0.5',
                        labelsVisible && 'ml-4 border-l border-[var(--border)]/80 pl-3',
                      )}
                    >
                      {section.label && labelsVisible ? (
                        <button
                          aria-expanded={!isSectionCollapsed}
                          className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-1 text-left text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                          onClick={() => toggleSection(group.key, section.label)}
                          type="button"
                        >
                          {isSectionCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronLeft className="h-3 w-3 shrink-0 -rotate-90" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 whitespace-nowrap">{section.label}</span>
                        </button>
                      ) : null}
                      {isSectionCollapsed ? null : section.items.map((item) => {
                        const Icon = item.icon
                        const active = activeView === item.view
                        return (
                          <button
                            key={`${group.key}:${section.label || 'default'}:${item.view}:${item.label}`}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'relative ml-3 flex min-h-9 w-[calc(100%-0.75rem)] items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium transition-colors',
                              mode === 'drawer' && 'min-h-11 text-[13px]',
                              !labelsVisible && 'lg:mx-auto lg:w-10 lg:justify-center lg:px-0',
                              active ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm before:absolute before:-left-[25px] before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                            )}
                            onClick={() => {
                              onViewChange(item.view)
                              onNavigate?.()
                            }}
                            title={item.label}
                            type="button"
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className={cn('whitespace-nowrap transition-opacity', labelsVisible ? 'opacity-100' : 'lg:hidden')}>
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
