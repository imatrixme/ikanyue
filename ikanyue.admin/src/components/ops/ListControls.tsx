import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'

import { Button } from '../ui/Button'

export function FilterSummary({ activeCount, onReset }: { activeCount: number; onReset: () => void }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <span className="text-[var(--muted-foreground)]">{activeCount > 0 ? `已启用 ${activeCount} 项筛选` : '显示全部记录'}</span>
      {activeCount > 0 ? (
        <Button icon={<RotateCcw className="h-4 w-4" />} onClick={onReset} type="button" variant="ghost">重置</Button>
      ) : null}
    </div>
  )
}

export function PaginationControls({ page, totalItems, totalPages, onPageChange }: { page: number; totalItems: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalItems === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm">
      <span className="text-[var(--muted-foreground)]">共 {totalItems} 条 · 第 {page}/{totalPages} 页</span>
      <div className="flex gap-2">
        <Button aria-label="上一页" className="h-9 w-9 px-0" disabled={page <= 1} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => onPageChange(page - 1)} type="button" variant="secondary" />
        <Button aria-label="下一页" className="h-9 w-9 px-0" disabled={page >= totalPages} icon={<ChevronRight className="h-4 w-4" />} onClick={() => onPageChange(page + 1)} type="button" variant="secondary" />
      </div>
    </div>
  )
}

export function ListEmptyState({ filtered, noun, onReset, onCreate }: { filtered: boolean; noun: string; onReset?: () => void; onCreate?: () => void }) {
  return (
    <div className="grid justify-items-center gap-3 px-5 py-16 text-center">
      <p className="font-semibold">{filtered ? `没有匹配的${noun}` : `还没有${noun}`}</p>
      <p className="text-sm text-[var(--muted-foreground)]">{filtered ? '调整筛选条件后重试。' : `创建或同步第一条${noun}记录后会显示在这里。`}</p>
      {filtered && onReset ? <Button onClick={onReset} type="button" variant="secondary">重置筛选</Button> : null}
      {!filtered && onCreate ? <Button onClick={onCreate} type="button">新增{noun}</Button> : null}
    </div>
  )
}
