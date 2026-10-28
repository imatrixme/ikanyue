import type { ReactNode } from 'react'

import { cn } from './utils'

export interface Column<T> {
  label: string
  render: (row: T) => ReactNode
  numeric?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  empty?: string
}

export function DataTable<T>({ columns, rows, rowKey, empty = '暂无数据' }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--muted)]">
          <tr>
            {columns.map((column) => (
              <th className={cn('whitespace-nowrap px-3 py-2 text-left text-xs font-semibold', column.numeric && 'text-right')} key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-3 py-6 text-center text-[var(--muted-foreground)]" colSpan={columns.length}>{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr className="border-t border-[var(--border)] align-top" key={rowKey(row, index)}>
              {columns.map((column) => (
                <td className={cn('px-3 py-2', column.numeric && 'text-right tabular-nums')} key={column.label}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="break-all font-mono text-xs">{children}</code>
}
