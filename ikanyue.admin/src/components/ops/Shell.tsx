import { LogOut, Search } from 'lucide-react'

import type { AppView, OpsProfile, ToastState } from '../../app/types'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Input'
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
  const roleTitle = profile.isAdmin ? '教务运营工作系统' : '教师今日工作台'
  const roleEyebrow = profile.isAdmin ? 'Teaching operations lifecycle' : 'Teaching tasks'

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[auto_1fr]">
        <AdminSidebar activeView={activeView} profile={profile} onViewChange={onViewChange} />
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-xs font-medium text-[var(--muted-foreground)]">{roleEyebrow}</p>
                <h1 className="text-lg font-semibold tracking-tight">{roleTitle}</h1>
              </div>
              <div className="flex flex-1 items-center justify-end gap-3">
                <div className="hidden w-full max-w-[360px] items-center gap-2 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 shadow-sm md:flex">
                  <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                  <Input className="h-8 border-0 px-0 shadow-none focus:ring-0" placeholder="搜索学员、班级、课堂、报告" aria-label="全局搜索" />
                </div>
                <Badge tone={profile.isAdmin ? 'blue' : 'green'}>{profile.isAdmin ? '管理员' : '教师'}</Badge>
                <span className="max-w-[120px] truncate text-sm font-semibold sm:max-w-none">{profile.realName || profile.nickName}</span>
                <Button variant="ghost" onClick={onLogout} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
                  退出
                </Button>
              </div>
            </div>
          </header>
          <main className="min-w-0 px-5 py-5">
            {toast ? (
              <div className={cn('mb-4 rounded-md border px-4 py-3 text-sm shadow-sm', toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-cyan-200 bg-cyan-50 text-cyan-700')}>
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
