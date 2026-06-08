import { CheckCircle2, Edit3, LockKeyhole, Plus, RotateCw, Search, UnlockKeyhole } from 'lucide-react'
import { useState } from 'react'

import { canEditResource, nextPublishStatus } from '../../app/resourceForms'
import { resourceConfig } from '../../app/resourceConfig'
import type { ListResult, OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Card'
import { DataTable } from '../ui/DataTable'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { SemanticSurface } from '../ui/SemanticSurface'
import { Sheet } from '../ui/Sheet'
import { DocumentEditorModal } from './DocumentEditorModal'
import { ResourceForm, type DocumentEditorRequest } from './ResourceForm'

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
  const [documentEditor, setDocumentEditor] = useState<DocumentEditorRequest | null>(null)
  const [advancedEditing, setAdvancedEditing] = useState(false)
  const config = resourceConfig[resource]
  const Icon = config.icon
  const editable = canEditResource(resource)
  const advanced = isAdvancedMaintenanceResource(resource)
  const maintenanceEnabled = editable && (!advanced || advancedEditing)
  const formRecord = creating ? null : editing
  const formOpen = maintenanceEnabled && (creating || Boolean(editing))
  const formTitle = formRecord?.id ? `编辑${config.title}` : config.createLabel || `新建${config.title}`

  return (
    <Panel>
      <PageHeader
        title={config.title}
        description={config.description}
        icon={<Icon className="h-5 w-5" aria-hidden="true" />}
        actions={(
          <>
          <div className="flex h-9 w-full min-w-[180px] items-center rounded-md border border-[var(--input)] bg-[var(--card)] px-2 shadow-sm sm:w-52">
            <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            <Input
              aria-label={`${config.title}搜索`}
              className="h-8 min-w-0 flex-1 border-0 px-2 focus:ring-0"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSearch(keyword)
                }
              }}
              placeholder={`搜索${config.title}`}
            />
          </div>
          <Button variant="secondary" onClick={() => onSearch(keyword)} icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}>
            {loading ? '加载中' : '刷新'}
          </Button>
          {advanced && editable ? (
            <Button
              onClick={() => {
                setAdvancedEditing((current) => {
                  const next = !current
                  if (!next) {
                    setCreating(false)
                    setEditing(null)
                    setDocumentEditor(null)
                  }
                  return next
                })
              }}
              icon={advancedEditing ? <LockKeyhole className="h-4 w-4" aria-hidden="true" /> : <UnlockKeyhole className="h-4 w-4" aria-hidden="true" />}
              variant={advancedEditing ? 'secondary' : 'ghost'}
            >
              {advancedEditing ? '退出修正模式' : '修正底层记录'}
            </Button>
          ) : null}
          {config.createLabel && maintenanceEnabled ? (
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
      {advanced ? (
        <SemanticSurface className="mx-4 mb-4 text-sm" tone={advancedEditing ? 'danger' : 'warning'}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={advancedEditing ? 'red' : 'amber'}>{advancedEditing ? '可直接修正' : '只读检查'}</Badge>
            <span className="font-medium [overflow-wrap:anywhere]">
              {advancedEditing ? '现在可以直接修改底层记录，请先确认关联的班级、课堂和影响范围。' : '这里默认只用于检查、定位问题和追踪底层记录。普通教务动作请从对应工作台进入。'}
            </span>
          </div>
          <p className="mt-1 text-xs opacity-75 [overflow-wrap:anywhere]">
            {advancedEditing ? '修正完成后建议退出，避免把底层记录当成日常入口。' : '只有在需要排查关系、修正状态、核对审计或补救异常数据时，才建议开启修正。'}
          </p>
        </SemanticSurface>
      ) : null}
      {relationResourceSceneHint(resource) ? (
        <SemanticSurface className="mx-4 mb-4 text-sm" tone="info">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">建议入口</Badge>
            <span className="font-medium [overflow-wrap:anywhere]">{relationResourceSceneHint(resource)}</span>
          </div>
          <p className="mt-1 text-xs opacity-75 [overflow-wrap:anywhere]">日常操作请优先从班级或课堂工作台进入，那里会锁定父级上下文，避免误选班级或课堂。</p>
        </SemanticSurface>
      ) : null}
      <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        <span>
          <strong className="text-[var(--foreground)]">{advanced ? '底层记录检查' : '列表查看'}</strong>
          ：可排序、搜索和勾选内容；{advanced ? '修正前先确认关联的班级或课堂。' : '需要创建复杂事务时，优先从工作台进入。'}
        </span>
        <Badge>{new Intl.NumberFormat('zh-CN').format(result?.pagination.totalItems || 0)} 条</Badge>
      </div>
      <DataTable
        columns={config.columns}
        rows={result?.items || []}
        resource={resource}
        resources={resources}
        renderActions={maintenanceEnabled ? (row) => (
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
        共 {new Intl.NumberFormat('zh-CN').format(result?.pagination.totalItems || 0)} 条记录
      </div>
      <Sheet
        open={formOpen}
        title={formTitle}
        description="保存前请核对关键字段。保存后会刷新当前列表。"
        side="right"
        suspended={Boolean(documentEditor)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setDocumentEditor(null)
        }}
      >
        {formOpen ? (
          <ResourceForm
            key={`${resource}-${formRecord?.id || 'new'}`}
            resource={resource}
            record={formRecord}
            embedded
            resources={resources}
            onOpenDocumentEditor={setDocumentEditor}
            onCancel={() => {
              setCreating(false)
              setEditing(null)
              setDocumentEditor(null)
            }}
            onSubmit={(payload) => {
              onSave?.(formRecord, payload)
              setCreating(false)
              setEditing(null)
              setDocumentEditor(null)
            }}
          />
        ) : null}
      </Sheet>
      <DocumentEditorModal
        open={Boolean(documentEditor)}
        title={documentEditor?.title || ''}
        label={documentEditor?.label || ''}
        value={documentEditor?.value || ''}
        onClose={() => setDocumentEditor(null)}
        onSave={(value) => {
          documentEditor?.onSave(value)
          setDocumentEditor(null)
        }}
        onUploadImage={onUploadRichTextImage}
      />
    </Panel>
  )
}

function relationResourceSceneHint(resource: OpsResource) {
  const hints: Partial<Record<OpsResource, string>> = {
    programStudents: '添加班级学员请优先使用“班级工作台”。',
    programTeachers: '分配班级老师请优先使用“班级工作台”。',
    sessionStudents: '记录课堂出勤请优先使用“课堂工作台”。',
    sessionTeachers: '确认课堂老师请优先使用“课堂工作台”。',
  }
  return hints[resource] || ''
}

function isAdvancedMaintenanceResource(resource: OpsResource) {
  return ['programStudents', 'programTeachers', 'sessionStudents', 'sessionTeachers', 'auditLogs'].includes(resource)
}
