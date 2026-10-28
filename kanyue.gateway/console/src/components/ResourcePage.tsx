import { useState, type ReactNode } from 'react'

import { deleteRecord, errorText, listRecords, saveRecord, type BaseRecord } from '../lib/api'
import { useResource } from '../lib/useResource'
import { RecordForm, type FieldSpec, type Values } from './RecordForm'
import { Button } from './ui/Button'
import { DataTable, type Column } from './ui/DataTable'
import { ErrorText } from './ui/Feedback'
import { PageHeader } from './ui/Panel'

export interface ResourceSpec<T extends BaseRecord> {
  collection: string
  title: string
  intro?: ReactNode
  query: string
  columns: Column<T>[]
  // fields enables editing; without them the page is read-only.
  fields?: FieldSpec[]
  defaults?: Values
  canCreate?: boolean
  canDelete?: boolean
  actions?: (row: T, reload: () => void) => ReactNode
}

// ResourcePage lists a collection and edits its records with a RecordForm.
export function ResourcePage<T extends BaseRecord>({ spec, children }: { spec: ResourceSpec<T>; children?: ReactNode }) {
  const list = useResource(spec.collection + spec.query, () => listRecords<T>(spec.collection, spec.query))
  const [editing, setEditing] = useState<{ record?: T } | null>(null)
  const [error, setError] = useState('')
  const { fields } = spec
  const canCreate = fields && spec.canCreate !== false
  const canDelete = fields && spec.canDelete !== false

  const remove = async (row: T) => {
    if (!window.confirm(`删除「${String(row.name ?? row.id)}」？`)) return
    try {
      await deleteRecord(spec.collection, row.id)
      list.reload()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  const columns: Column<T>[] = [...spec.columns]
  if (fields || spec.actions) {
    columns.push({
      label: '操作',
      render: (row) => (
        <span className="flex gap-2">
          {spec.actions?.(row, list.reload)}
          {fields ? <Button onClick={() => setEditing({ record: row })}>编辑</Button> : null}
          {canDelete ? <Button onClick={() => remove(row)} variant="ghost">删除</Button> : null}
        </span>
      ),
    })
  }

  return (
    <>
      <PageHeader intro={spec.intro} title={spec.title}>
        {canCreate ? <Button onClick={() => setEditing({})} variant="primary">新建</Button> : null}
      </PageHeader>
      {editing && fields ? (
        <RecordForm
          defaults={spec.defaults}
          fields={fields}
          key={editing.record?.id ?? 'new'}
          onCancel={() => setEditing(null)}
          onSubmit={async (body) => {
            await saveRecord(spec.collection, editing.record?.id, body)
            setEditing(null)
            list.reload()
          }}
          record={editing.record}
          title={`${editing.record ? '编辑' : '新建'}${spec.title}`}
        />
      ) : null}
      <ErrorText error={error || list.error} />
      <DataTable columns={columns} empty={list.loading ? '加载中…' : '暂无数据'} rowKey={(row) => row.id} rows={list.data ?? []} />
      {children}
    </>
  )
}
