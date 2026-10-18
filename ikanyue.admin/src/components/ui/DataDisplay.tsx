import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { ReactNode, TableHTMLAttributes } from 'react'

import { Button } from './Button'
import { Skeleton } from './Feedback'
import { cn } from './utils'

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function ResponsiveDataRegion({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  return <><div className="hidden overflow-x-auto md:block">{desktop}</div><div className="grid divide-y divide-[var(--border)] md:hidden">{mobile}</div></>
}

/** Says out loud that a list stopped short instead of dropping rows silently. */
export function TruncationNotice({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null
  return <p className="border-b border-[var(--border)] px-4 py-2 text-sm text-[var(--warning-foreground)]" role="note">仅显示前 {shown} 条，共 {total} 条</p>
}

export function EmptyState({ filtered = false, noun, onCreate, onReset }: { filtered?: boolean; noun: string; onCreate?: () => void; onReset?: () => void }) {
  return (
    <div className="grid min-h-48 place-items-center px-5 py-10 text-center">
      <div>
        <p className="text-sm text-[var(--muted-foreground)]">{filtered ? `没有匹配的${noun}` : `还没有${noun}`}</p>
        {(filtered && onReset) || (!filtered && onCreate) ? <div className="mt-3">{filtered && onReset ? <Button onClick={onReset} type="button" variant="secondary">重置筛选</Button> : null}{!filtered && onCreate ? <Button onClick={onCreate} type="button">新增{noun}</Button> : null}</div> : null}
      </div>
    </div>
  )
}

export function AsyncState({ children, empty, error, errorTitle = '数据加载失败', loading, loadingLabel, onRetry }: { children: ReactNode; empty?: ReactNode; error?: string; errorTitle?: string; loading: boolean; loadingLabel: string; onRetry?: () => void }) {
  if (loading) {
    return <div aria-label={loadingLabel} className="grid min-h-64 content-center gap-3 px-5 text-center"><Skeleton className="mx-auto h-4 w-40" /><Skeleton className="mx-auto h-4 w-56" /><p className="text-sm text-[var(--muted-foreground)]">{loadingLabel}</p></div>
  }
  if (error) {
    return <div className="grid min-h-64 place-items-center px-5 text-center"><div><p className="font-semibold">{errorTitle}</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{error}</p>{onRetry ? <Button className="mt-4" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry} type="button">重新加载</Button> : null}</div></div>
  }
  if (empty) return <>{empty}</>
  return <>{children}</>
}

export function Pagination({ onPageChange, page, totalItems, totalPages }: { onPageChange: (page: number) => void; page: number; totalItems: number; totalPages: number }) {
  if (totalItems === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm">
      <span className="text-[var(--muted-foreground)]">共 {totalItems} 条 · 第 {page}/{totalPages} 页</span>
      <div className="flex gap-2"><Button aria-label="上一页" className="h-9 w-9 px-0" disabled={page <= 1} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => onPageChange(page - 1)} type="button" variant="secondary" /><Button aria-label="下一页" className="h-9 w-9 px-0" disabled={page >= totalPages} icon={<ChevronRight className="h-4 w-4" />} onClick={() => onPageChange(page + 1)} type="button" variant="secondary" /></div>
    </div>
  )
}

export function Tabs<T extends string>({ label, onChange, options, value }: { label: string; onChange: (value: T) => void; options: Array<{ label: string; value: T }>; value: T }) {
  return <div aria-label={label} className="flex gap-5 border-b border-[var(--border)]" role="tablist">{options.map((option) => <button aria-selected={value === option.value} className={cn('border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-[var(--muted-foreground)]', value === option.value && 'border-[var(--primary)] text-[var(--foreground)]')} key={option.value} onClick={() => onChange(option.value)} role="tab" type="button">{option.label}</button>)}</div>
}
