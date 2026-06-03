type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

export function statusTone(value: unknown): BadgeTone {
  if (value === true || value === 'active' || value === 'published' || value === 'attended' || value === '已审核') {
    return 'green'
  }
  if (value === false || value === 'draft' || value === 'registered' || value === '待审核') {
    return 'amber'
  }
  if (value === 'inactive' || value === 'disabled' || value === 'cancelled' || value === 'no_show' || value === '禁用') {
    return 'red'
  }
  return 'neutral'
}
