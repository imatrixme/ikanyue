import { Plus, RotateCw, Search } from 'lucide-react'
import { useState } from 'react'

import { resourceConfig } from '../../app/resourceConfig'
import type { ListResult, OpsResource, ResourceRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { Panel, SectionHeader } from '../ui/Card'
import { DataTable } from '../ui/DataTable'
import { Input } from '../ui/Input'

interface ResourceViewProps {
  resource: OpsResource
  result?: ListResult<ResourceRecord>
  onSearch: (keyword: string) => void
  onCreate?: () => void
  loading: boolean
}

export function ResourceView({ resource, result, onSearch, onCreate, loading }: ResourceViewProps) {
  const [keyword, setKeyword] = useState('')
  const config = resourceConfig[resource]
  const Icon = config.icon

  return (
    <Panel>
      <SectionHeader>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#dfeef2] text-[#174a5c]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">{config.title}</h2>
            <p className="text-sm text-[#6f7880]">{config.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center rounded-md border border-[#d8dedb] bg-white px-2">
            <Search className="h-4 w-4 text-[#6f7880]" aria-hidden="true" />
            <Input
              aria-label={`${config.title}搜索`}
              className="h-8 w-40 border-0 px-2 focus:ring-0"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSearch(keyword)
                }
              }}
              placeholder="筛选"
            />
          </div>
          <Button variant="secondary" onClick={() => onSearch(keyword)} icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}>
            {loading ? '加载中' : '刷新'}
          </Button>
          {config.createLabel ? <Button onClick={onCreate} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>{config.createLabel}</Button> : null}
        </div>
      </SectionHeader>
      <DataTable columns={config.columns} rows={result?.items || []} />
      <div className="border-t border-[#e6ebe8] px-4 py-3 text-sm text-[#6f7880]">
        共 {result?.pagination.totalItems || 0} 条记录
      </div>
    </Panel>
  )
}
