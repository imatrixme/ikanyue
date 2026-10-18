import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'

import { sectionLabel, sectionOf } from '../../app/navigation'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile, StudentRecord, ToastState } from '../../app/types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { ToastMessage } from '../ui/Feedback'
import { NotifyProvider } from '../ui/Notify'
import { cn } from '../ui/utils'
import { AdminSidebar } from './AdminSidebar'
import { GlobalStudentSearch } from './GlobalStudentSearch'

interface ShellProps {
  activeView: AppView
  profile: OpsProfile
  toast: ToastState | null
  onViewChange: (view: AppView) => void
  onLogout: () => void
  onOpenStudent?: (student: StudentRecord) => void
  onSearchStudents?: (keyword: string) => Promise<StudentRecord[]>
  children: React.ReactNode
}

export function Shell({ activeView, profile, toast, onViewChange, onLogout, onOpenStudent, onSearchStudents, children }: ShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const section = sectionOf(activeView)
  const tabs = section.tabs.filter((tab) => canAccessView(profile, tab.view))

  return (
    <NotifyProvider>
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[auto_1fr]">
        <AdminSidebar activeView={activeView} profile={profile} onViewChange={onViewChange} />
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
            <button
              aria-label="关闭导航遮罩"
              className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
              onClick={() => setMobileNavOpen(false)}
              type="button"
            />
            <div className="relative h-full w-[min(360px,calc(100vw-2rem))]">
              <AdminSidebar
                activeView={activeView}
                mode="drawer"
                onClose={() => setMobileNavOpen(false)}
                onNavigate={() => setMobileNavOpen(false)}
                onViewChange={onViewChange}
                profile={profile}
              />
            </div>
          </div>
        ) : null}
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/80">
            <div className="flex min-h-14 items-center justify-between gap-2 px-4 py-2 sm:gap-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <IconButton
                  className="inline-flex lg:hidden"
                  icon={<Menu className="h-4 w-4" aria-hidden="true" />}
                  label="打开导航"
                  onClick={() => setMobileNavOpen(true)}
                  type="button"
                />
                <p className="truncate text-sm font-semibold">{sectionLabel(section, profile)}</p>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
                {onSearchStudents && onOpenStudent ? <div className="hidden flex-1 justify-end sm:flex"><GlobalStudentSearch onOpen={onOpenStudent} onSearch={onSearchStudents} /></div> : null}
                <span className="hidden max-w-[160px] truncate text-sm text-[var(--muted-foreground)] md:inline">{profile.realName || profile.nickName}{profile.isAdmin ? ' · 管理员' : ''}</span>
                <Button aria-label="退出" className="h-9 w-9 px-0 sm:w-auto sm:px-3" variant="ghost" onClick={onLogout} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
                  <span className="hidden sm:inline">退出</span>
                </Button>
              </div>
            </div>
            {tabs.length > 1 ? (
              <nav aria-label="分区导航" className="flex gap-5 overflow-x-auto px-4 sm:px-6">
                {tabs.map((tab) => (
                  <button
                    aria-current={tab.view === activeView ? 'page' : undefined}
                    className={cn('shrink-0 border-b-2 border-transparent py-2.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]', tab.view === activeView && 'border-[var(--foreground)] font-semibold text-[var(--foreground)]')}
                    key={tab.view}
                    onClick={() => onViewChange(tab.view)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            ) : null}
          </header>
          <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-6">
            {toast ? (
              <div className="mb-4"><ToastMessage tone={toast.type === 'error' ? 'error' : 'info'}>{toast.message}</ToastMessage></div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
    </NotifyProvider>
  )
}
