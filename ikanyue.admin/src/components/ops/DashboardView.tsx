import { ArrowUpRight } from 'lucide-react'

import { metricIconByKey } from '../../app/resourceConfig'
import type { DashboardData } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeader } from '../ui/Card'

interface DashboardViewProps {
  data: DashboardData | null
}

export function DashboardView({ data }: DashboardViewProps) {
  const cards = data?.cards || []
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d29a2e]">Dashboard</p>
          <h2 className="mt-1 text-2xl font-semibold">运营总览</h2>
        </div>
        <Badge tone="blue">第一阶段</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = metricIconByKey[card.key as keyof typeof metricIconByKey] || ArrowUpRight
          return (
            <Panel key={card.key} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#6f7880]">{card.label}</span>
                <Icon className="h-4 w-4 text-[#174a5c]" aria-hidden="true" />
              </div>
              <div className="mt-5 text-3xl font-semibold tabular-nums">{card.value}</div>
            </Panel>
          )
        })}
      </div>
      <Panel>
        <SectionHeader>
          <div>
            <h3 className="font-semibold">待处理</h3>
            <p className="text-sm text-[#6f7880]">审核、发布、报告分享等运营任务集中展示。</p>
          </div>
        </SectionHeader>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {(data?.pending || []).map((item) => (
            <div key={item.key} className="rounded-md border border-[#e6ebe8] p-4">
              <div className="text-sm text-[#6f7880]">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</div>
            </div>
          ))}
          <div className="rounded-md border border-[#e6ebe8] p-4">
            <div className="text-sm text-[#6f7880]">近期报告</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">7</div>
          </div>
          <div className="rounded-md border border-[#e6ebe8] p-4">
            <div className="text-sm text-[#6f7880]">可分享报告</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">5</div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
