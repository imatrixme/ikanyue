import type { ReactNode } from 'react'

import { Badge } from './Badge'
import { statusTone } from './status'
import { displayResourceField, isFileValue } from '../../app/resourceForms'
import type { ResourceColumn } from '../../app/resourceConfig'
import type { OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'

interface DataTableProps {
  columns: ResourceColumn[]
  rows: ResourceRecord[]
  resource?: OpsResource
  resources?: ResourceLookup
  emptyLabel?: string
  renderActions?: (row: ResourceRecord) => ReactNode
}

export function DataTable({ columns, rows, resource, resources = {}, emptyLabel = '暂无数据', renderActions }: DataTableProps) {
  const columnCount = columns.length + (renderActions ? 1 : 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/70 text-left text-xs text-[var(--muted-foreground)]">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium">
                {column.label}
              </th>
            ))}
            {renderActions ? <th className="px-4 py-3 font-medium">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/45 last:border-0">
              {columns.map((column) => {
                const value = column.render ? column.render(row, resources) : resource ? displayResourceField(resource, column.key, row[column.key], resources) : row[column.key]
                return <td key={column.key} className="px-4 py-3 text-[var(--foreground)]">{renderCell(column.key, value)}</td>
              })}
              {renderActions ? <td className="px-4 py-3">{renderActions(row)}</td> : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-[var(--muted-foreground)]" colSpan={columnCount}>
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function isStatusColumn(key: string) {
  return ['status', 'blocked', 'verified', 'isAdmin'].includes(key)
}

function renderCell(key: string, value: unknown) {
  if (isStatusColumn(key)) {
    return <Badge tone={statusTone(value)}>{String(value ?? '-')}</Badge>
  }
  if (isImageColumn(key)) {
    return <ImageCell value={value} />
  }
  return String(value ?? '-')
}

function ImageCell({ value }: { value: unknown }) {
  const text = isFileValue(value) ? value.name : typeof value === 'string' ? value : ''
  if (!text) {
    return <span className="text-[var(--muted-foreground)]">未上传</span>
  }
  if (isImageUrl(text)) {
    return (
      <div className="flex items-center gap-2">
        <img alt="图片预览" className="h-9 w-9 rounded-md border border-[var(--border)] object-cover" src={text} />
        <span className="max-w-[120px] truncate text-xs text-[var(--muted-foreground)]">{fileNameFromPath(text)}</span>
      </div>
    )
  }
  return <span className="max-w-[140px] truncate text-sm">{fileNameFromPath(text)}</span>
}

function isImageColumn(key: string) {
  return /avatar|cover|image|images|imageUrl/i.test(key)
}

function isImageUrl(value: string) {
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(value)
}

function fileNameFromPath(value: string) {
  const segments = value.split(/[/?#]/).filter(Boolean)
  return segments[segments.length - 1] || value
}
