import { useEffect, useState } from 'react'

export function usePersistedFilters<T>(key: string, defaults: T, sanitize: (value: unknown, defaults: T) => T) {
  const [value, setValue] = useState<T>(() => readPersistedFilters(key, defaults, sanitize))

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

export function readPersistedFilters<T>(key: string, defaults: T, sanitize: (value: unknown, defaults: T) => T): T {
  if (typeof localStorage === 'undefined') return defaults
  try {
    const stored = localStorage.getItem(key)
    return stored ? sanitize(JSON.parse(stored), defaults) : defaults
  } catch {
    localStorage.removeItem(key)
    return defaults
  }
}

export function pageItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  }
}

export function parseOptionalNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}
