import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function usePersistedFilters<T>(key: string, defaults: T, sanitize: (value: unknown, defaults: T) => T) {
  const [value, setValue] = useState<T>(() => readPersistedFilters(key, defaults, sanitize))

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

/**
 * Filters that live in the URL so a refresh or a shared link keeps them.
 * Without URL parameters the last filters saved in localStorage apply.
 */
export function useUrlFilters<T extends { [K in keyof T]: string }>(key: string, defaults: T, sanitize: (value: unknown, defaults: T) => T) {
  const [params, setParams] = useSearchParams()
  const [persisted, setPersisted] = useState<T>(() => readPersistedFilters(key, defaults, sanitize))
  const fields = useMemo(() => Object.keys(defaults) as Array<keyof T & string>, [defaults])
  const search = params.toString()
  const filters = useMemo(() => {
    const current = new URLSearchParams(search)
    if (!fields.some((field) => current.has(field))) return persisted
    return sanitize(Object.fromEntries(fields.map((field) => [field, current.get(field) ?? defaults[field]])), defaults)
  }, [defaults, fields, persisted, sanitize, search])

  const setFilters = useCallback((update: T | ((current: T) => T)) => {
    const next = typeof update === 'function' ? update(filters) : update
    setPersisted(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(next))
    setParams((current) => {
      const result = new URLSearchParams(current)
      for (const field of fields) {
        if (next[field] && next[field] !== defaults[field]) result.set(field, next[field])
        else result.delete(field)
      }
      return result
    }, { replace: true })
  }, [defaults, fields, filters, key, setParams])

  return [filters, setFilters] as const
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
