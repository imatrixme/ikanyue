import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'

import type { AppView, OpsProfile, ToastState } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cn } from '../ui/utils'
import { AdminSidebar } from './AdminSidebar'

interface ShellProps {
  activeView: AppView
  profile: OpsProfile
  toast: ToastState | null
  onViewChange: (view: AppView) => void
  onLogout: () => void
  children: React.ReactNode
}

export function Shell({ activeView, profile, toast, onViewChange, onLogout, children }: ShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
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
            <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  aria-label="打开导航"
                  className="inline-flex h-9 w-9 px-0 lg:hidden"
                  icon={<Menu className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setMobileNavOpen(true)}
                  type="button"
                  variant="secondary"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">线下积分与实物</p>
                  <h1 className="truncate text-base font-semibold">积分服务台</h1>
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
                <span className="hidden sm:inline-flex"><Badge tone="blue">管理员</Badge></span>
                <span className="hidden max-w-[120px] truncate text-sm font-semibold md:inline md:max-w-none">{profile.realName || profile.nickName}</span>
                <Button aria-label="退出" className="h-9 w-9 px-0 sm:w-auto sm:px-3" variant="ghost" onClick={onLogout} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
                  <span className="hidden sm:inline">退出</span>
                </Button>
              </div>
            </div>
          </header>
          <main className="mx-auto min-w-0 max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
            {toast ? (
              <div className={cn('mb-4 rounded-md border px-4 py-3 text-sm shadow-sm', toast.type === 'error' ? 'border-[var(--destructive)]/25 bg-[var(--danger-soft)] text-[var(--destructive)]' : 'border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info)]')}>
                {toast.message}
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
