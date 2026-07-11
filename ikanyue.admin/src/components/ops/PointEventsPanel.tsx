import { History } from 'lucide-react'

import type { PointEvent, StudentPointSummary } from '../../app/types'
import { Panel } from '../ui/Card'
import { cn } from '../ui/utils'

export function PointEventsPanel({ events }: { events: StudentPointSummary['events'] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <History className="h-4 w-4" aria-hidden="true" />
          积分记录
        </h3>
      </div>
      {events.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/70 text-left text-xs text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">操作</th>
                  <th className="px-4 py-3 font-medium">变化</th>
                  <th className="px-4 py-3 font-medium">余额</th>
                  <th className="px-4 py-3 font-medium">原因</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3">{eventLabel(event)}</td>
                    <td className={deltaClass(event)}>{formatDelta(event.delta)}</td>
                    <td className="px-4 py-3 tabular-nums">{event.balanceAfter}</td>
                    <td className="px-4 py-3">{eventReason(event)}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDate(event.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="grid gap-0 px-5 py-2 md:hidden" aria-label="积分记录时间线">
            {events.map((event) => (
              <li key={event.id} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 py-4 before:absolute before:bottom-0 before:left-[8px] before:top-0 before:w-px before:bg-[var(--border)] last:before:bottom-1/2">
                <span className={cn('relative z-10 mt-1 h-[17px] w-[17px] rounded-full border-4 border-[var(--card)]', event.delta < 0 ? 'bg-[var(--destructive)]' : 'bg-[var(--success)]')} />
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{eventLabel(event)}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{eventReason(event)}</p>
                    </div>
                    <p className={cn('font-semibold tabular-nums', event.delta < 0 ? 'text-[var(--destructive)]' : 'text-[var(--success)]')}>{formatDelta(event.delta)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                    <span>操作后 {event.balanceAfter} 分</span>
                    <time>{formatDate(event.created)}</time>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">暂无积分记录</div>
      )}
    </Panel>
  )
}

function eventLabel(event: PointEvent) {
  return event.type === 'offline_redeem' ? '线下兑换' : '增加积分'
}

function eventReason(event: PointEvent) {
  return event.rewardSnapshot?.name || event.reason || event.remark || '-'
}

function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta}`
}

function deltaClass(event: PointEvent) {
  return cn('px-4 py-3 font-semibold tabular-nums', event.delta < 0 ? 'text-[var(--destructive)]' : 'text-[var(--success)]')
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
