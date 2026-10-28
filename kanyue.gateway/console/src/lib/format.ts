export function formatTime(value: unknown): string {
  if (!value) return ''
  const at = new Date(String(value))
  if (Number.isNaN(at.getTime()) || at.getTime() <= 0) return ''
  return at.toLocaleString('zh-CN', { hour12: false })
}

export function percent(ratio: number): string {
  return `${(100 * ratio).toFixed(1)}%`
}

export function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}
