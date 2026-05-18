import { Badge } from './Badge'
import { statusTone } from './status'
import type { ResourceColumn } from '../../app/resourceConfig'
import type { ResourceRecord } from '../../app/types'

interface DataTableProps {
  columns: ResourceColumn[]
  rows: ResourceRecord[]
  emptyLabel?: string
}

export function DataTable({ columns, rows, emptyLabel = '暂无数据' }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#f7faf9] text-left text-xs uppercase tracking-[0.08em] text-[#6f7880]">
            {columns.map((column) => (
              <th key={column.key} className="border-b border-[#e6ebe8] px-4 py-3 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#edf0ef] last:border-0">
              {columns.map((column) => {
                const value = column.render ? column.render(row) : row[column.key]
                return (
                  <td key={column.key} className="px-4 py-3 text-[#28323b]">
                    {isStatusColumn(column.key) ? <Badge tone={statusTone(value)}>{String(value ?? '-')}</Badge> : String(value ?? '-')}
                  </td>
                )
              })}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-[#6f7880]" colSpan={columns.length}>
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
