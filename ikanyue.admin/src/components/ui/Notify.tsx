import { CheckCircle2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { NotifyContext, type Notify } from './notifyContext'

interface Notice { id: number; message: string }

export function NotifyProvider({ children, duration = 4000 }: { children: ReactNode; duration?: number }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setNotices((items) => items.filter((item) => item.id !== id)), [])
  const notify = useCallback<Notify>((message) => {
    const id = nextId.current
    nextId.current += 1
    setNotices((items) => [...items.slice(-2), { id, message }])
  }, [])
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] grid w-[min(360px,calc(100vw-2rem))] gap-2" role="status">
        {notices.map((notice) => <NoticeItem duration={duration} key={notice.id} notice={notice} onDismiss={dismiss} />)}
      </div>
    </NotifyContext.Provider>
  )
}

function NoticeItem({ duration, notice, onDismiss }: { duration: number; notice: Notice; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(notice.id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, notice.id, onDismiss])
  return (
    <div className="pointer-events-auto flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm shadow-md">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
      <p className="min-w-0 flex-1">{notice.message}</p>
      <button aria-label="关闭提示" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => onDismiss(notice.id)} type="button"><X className="h-4 w-4" /></button>
    </div>
  )
}
