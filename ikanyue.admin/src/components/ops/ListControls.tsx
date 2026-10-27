import { RotateCcw } from 'lucide-react'

import { Button } from '../ui/Button'
export { EmptyState as ListEmptyState, Pagination as PaginationControls } from '../ui/DataDisplay'

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
