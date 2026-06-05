import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { displayResourceField, isFileValue } from '../../app/resourceForms'
import type { ResourceColumn } from '../../app/resourceConfig'
import type { OpsResource, ResourceLookup, ResourceRecord } from '../../app/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { Input } from './Input'
import { statusTone } from './status'
import { cn } from './utils'

interface DataTableProps {
  columns: ResourceColumn[]
  rows: ResourceRecord[]
  resource?: OpsResource
  resources?: ResourceLookup
  emptyLabel?: string
  renderActions?: (row: ResourceRecord) => ReactNode
}

type Density = 'comfortable' | 'compact'

export function DataTable({ columns, rows, resource, resources = {}, emptyLabel = '暂无数据', renderActions }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [density, setDensity] = useState<Density>('comfortable')
  const tableColumns = useMemo(() => buildColumns(columns, resource, resources, renderActions), [columns, resource, renderActions, resources])
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, rowSelection, globalFilter },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => rowSearchText(row.original, columns, resource, resources).includes(String(filterValue).trim().toLowerCase()),
  })
  const selectedCount = table.getSelectedRowModel().rows.length
  const visibleCount = table.getRowModel().rows.length
  const rowClass = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3'

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex h-9 min-w-[240px] max-w-sm flex-1 items-center rounded-md border border-[var(--input)] bg-[var(--card)] px-2 shadow-sm">
          <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          <Input
            aria-label="当前页快速筛选"
            className="h-8 border-0 px-2 focus:ring-0"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="当前页快速筛选"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span>显示 {visibleCount} / {rows.length}</span>
          <span>已选 {selectedCount}</span>
          <Button className="h-8 px-2 text-xs" variant="secondary" type="button" onClick={() => setDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}>
            {density === 'compact' ? '舒展' : '紧凑'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-[var(--border)] bg-[var(--muted)]/70 text-left text-xs text-[var(--muted-foreground)]">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/45 last:border-0 data-[selected=true]:bg-cyan-50/60" data-selected={row.getIsSelected()}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn(rowClass, 'text-[var(--foreground)]')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-[var(--muted-foreground)]" colSpan={tableColumns.length}>
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function buildColumns(
  columns: ResourceColumn[],
  resource: OpsResource | undefined,
  resources: ResourceLookup,
  renderActions?: (row: ResourceRecord) => ReactNode,
): Array<ColumnDef<ResourceRecord>> {
  const selectionColumn: ColumnDef<ResourceRecord> = {
    id: '_select',
    enableSorting: false,
    header: ({ table }) => (
      <input
        aria-label="选择当前页全部记录"
        checked={table.getIsAllPageRowsSelected()}
        className="h-4 w-4 rounded border-[var(--border)]"
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        type="checkbox"
      />
    ),
    cell: ({ row }) => (
      <input
        aria-label={`选择记录 ${row.original.id}`}
        checked={row.getIsSelected()}
        className="h-4 w-4 rounded border-[var(--border)]"
        onChange={row.getToggleSelectedHandler()}
        type="checkbox"
      />
    ),
  }
  const resourceColumns = columns.map<ColumnDef<ResourceRecord>>((column) => ({
    id: column.key,
    accessorFn: (row) => cellText(column, row, resource, resources),
    sortingFn: 'alphanumeric',
    header: ({ column: tableColumn }) => (
      <button className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--secondary)]" onClick={tableColumn.getToggleSortingHandler()} type="button">
        {column.label}
        <SortIcon state={tableColumn.getIsSorted()} />
      </button>
    ),
    cell: ({ row }) => renderCell(column.key, cellValue(column, row.original, resource, resources)),
  }))
  const actionColumn: ColumnDef<ResourceRecord> | null = renderActions ? {
    id: '_actions',
    enableSorting: false,
    header: '操作',
    cell: ({ row }) => renderActions(row.original),
  } : null
  return [selectionColumn, ...resourceColumns, ...(actionColumn ? [actionColumn] : [])]
}

function SortIcon({ state }: { state: false | 'asc' | 'desc' }) {
  if (state === 'asc') {
    return <ArrowUp className="h-3 w-3" aria-hidden="true" />
  }
  if (state === 'desc') {
    return <ArrowDown className="h-3 w-3" aria-hidden="true" />
  }
  return <ChevronsUpDown className="h-3 w-3 opacity-60" aria-hidden="true" />
}

function cellValue(column: ResourceColumn, row: ResourceRecord, resource?: OpsResource, resources?: ResourceLookup) {
  if (column.render) {
    return column.render(row, resources)
  }
  return resource ? displayResourceField(resource, column.key, row[column.key], resources) : row[column.key]
}

function cellText(column: ResourceColumn, row: ResourceRecord, resource?: OpsResource, resources?: ResourceLookup) {
  return String(cellValue(column, row, resource, resources) ?? '').toLowerCase()
}

function rowSearchText(row: ResourceRecord, columns: ResourceColumn[], resource?: OpsResource, resources?: ResourceLookup) {
  return columns.map((column) => cellText(column, row, resource, resources)).join(' ')
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
