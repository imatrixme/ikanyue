import { CheckCircle2, Edit3, Plus, RotateCw, Search } from 'lucide-react'
import { useState } from 'react'

import { canEditResource, nextPublishStatus } from '../../app/resourceForms'
import { resourceConfig } from '../../app/resourceConfig'
import type { ListResult, OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { DataTable } from '../ui/DataTable'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Sheet } from '../ui/Sheet'
import { ResourceForm } from './ResourceForm'

interface ResourceViewProps {
  resource: OpsResource
  result?: ListResult<ResourceRecord>
  onSearch: (keyword: string) => void
  onSave?: (record: ResourceRecord | null, payload: Record<string, unknown>) => void
  onPublish?: (record: ResourceRecord) => void
  loading: boolean
  resources?: ResourceLookup
  onUploadRichTextImage?: (file: File) => Promise<string>
}

export function ResourceView({ resource, result, onSearch, onSave, onPublish, loading, resources = {}, onUploadRichTextImage }: ResourceViewProps) {
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<ResourceRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const config = resourceConfig[resource]
  const Icon = config.icon
  const editable = canEditResource(resource)
  const formRecord = creating ? null : editing
  const formOpen = editable && (creating || Boolean(editing))
  const formTitle = formRecord?.id ? `编辑${config.title}` : config.createLabel || `新建${config.title}`

  return (
    <Panel>
      <PageHeader
        title={config.title}
        description={config.description}
        icon={<Icon className="h-5 w-5" aria-hidden="true" />}
        actions={(
          <>
          <div className="flex h-9 items-center rounded-md border border-[var(--input)] bg-[var(--card)] px-2 shadow-sm">
            <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
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
          {config.createLabel ? (
            <Button
              onClick={() => {
                setCreating(true)
                setEditing(null)
              }}
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              {config.createLabel}
            </Button>
          ) : null}
          </>
        )}
      />
      <DataTable
        columns={config.columns}
        rows={result?.items || []}
        resource={resource}
        resources={resources}
        renderActions={editable ? (row) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false)
                setEditing(row)
              }}
              icon={<Edit3 className="h-4 w-4" aria-hidden="true" />}
            >
              编辑
            </Button>
            {nextPublishStatus(resource, row.status) ? (
              <Button variant="ghost" onClick={() => onPublish?.(row)} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                {nextPublishStatus(resource, row.status) === 'draft' ? '转草稿' : '发布'}
              </Button>
            ) : null}
          </div>
        ) : undefined}
      />
      <div className="border-t border-[var(--border)] bg-[var(--muted)]/25 px-4 py-3 text-sm text-[var(--muted-foreground)]">
        共 {result?.pagination.totalItems || 0} 条记录
      </div>
      <Sheet
        open={formOpen}
        title={formTitle}
        description="保存后会刷新当前资源列表，列表布局保持不变。"
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        footer={(
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              取消
            </Button>
            <Button type="submit" form={`resource-form-${resource}`} icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
              保存
            </Button>
          </div>
        )}
      >
        {formOpen ? (
          <ResourceForm
            key={`${resource}-${formRecord?.id || 'new'}`}
            resource={resource}
            record={formRecord}
            embedded
            actions={null}
            resources={resources}
            onUploadRichTextImage={onUploadRichTextImage}
            onSubmit={(payload) => {
              onSave?.(formRecord, payload)
              setCreating(false)
              setEditing(null)
            }}
          />
        ) : null}
      </Sheet>
    </Panel>
  )
}
