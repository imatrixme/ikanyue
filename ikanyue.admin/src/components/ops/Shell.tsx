import { LogOut, Search } from 'lucide-react'

import { navItems } from '../../app/resourceConfig'
import { canAccessView } from '../../app/state'
import type { AppView, OpsProfile, ToastState } from '../../app/types'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Input'
import { cn } from '../ui/utils'

interface ShellProps {
  activeView: AppView
  profile: OpsProfile
  toast: ToastState | null
  onViewChange: (view: AppView) => void
  onLogout: () => void
  children: React.ReactNode
}

export function Shell({ activeView, profile, toast, onViewChange, onLogout, children }: ShellProps) {
  const visibleNav = navItems.filter((item) => canAccessView(profile, item.view))
  return (
    <div className="min-h-screen bg-[#f6f3ed] text-[#17202a]">
      <header className="sticky top-0 z-20 border-b border-[#d8dedb] bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f7880]">KanYue Ops</p>
            <h1 className="text-lg font-semibold">声乐教务运营系统</h1>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="hidden w-full max-w-[320px] items-center gap-2 rounded-md border border-[#d8dedb] bg-white px-3 md:flex">
              <Search className="h-4 w-4 text-[#6f7880]" aria-hidden="true" />
              <Input className="h-8 border-0 px-0 shadow-none focus:ring-0" placeholder="搜索学员、内容、报告" aria-label="全局搜索" />
            </div>
            <Badge tone={profile.isAdmin ? 'blue' : 'green'}>{profile.isAdmin ? '管理员' : '教师'}</Badge>
            <span className="text-sm font-semibold">{profile.realName || profile.nickName}</span>
            <Button variant="ghost" onClick={onLogout} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
              退出
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[232px_1fr]">
        <nav className="border-b border-[#d8dedb] bg-[#fffdf8] p-3 lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {visibleNav.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.view}
                  className={cn(
                    'flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-[#39434d] transition',
                    activeView === item.view ? 'bg-[#174a5c] text-white' : 'hover:bg-[#e9eee9]',
                  )}
                  onClick={() => onViewChange(item.view)}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
        <main className="min-w-0 px-4 py-5">
          {toast ? (
            <div className={cn('mb-4 rounded-md border px-4 py-3 text-sm', toast.type === 'error' ? 'border-[#e6beb6] bg-[#f5e3df] text-[#843326]' : 'border-[#bdd9df] bg-[#dfeef2] text-[#174a5c]')}>
              {toast.message}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
