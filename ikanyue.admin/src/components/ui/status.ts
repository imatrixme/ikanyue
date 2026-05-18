type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

export function statusTone(value: unknown): BadgeTone {
  if (value === true || value === 'active' || value === 'published' || value === '已审核') {
    return 'green'
  }
  if (value === false || value === 'draft' || value === '待审核') {
    return 'amber'
  }
  if (value === 'inactive' || value === '禁用') {
    return 'red'
  }
  return 'neutral'
}
