// The console talks to two APIs on the gateway's admin plane, both with a
// superuser token: PocketBase collections (/api/collections/...) and the
// gateway's own /gateway/v1 endpoints.

const tokenKey = 'gateway.token'
const emailKey = 'gateway.email'

type Listener = () => void
const listeners = new Set<Listener>()

export const session = {
  token: () => sessionStorage.getItem(tokenKey) ?? '',
  email: () => sessionStorage.getItem(emailKey) ?? '',
  signIn(token: string, email: string) {
    sessionStorage.setItem(tokenKey, token)
    sessionStorage.setItem(emailKey, email)
    listeners.forEach((listener) => listener())
  },
  signOut() {
    sessionStorage.removeItem(tokenKey)
    listeners.forEach((listener) => listener())
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super(describe(status, body))
    this.status = status
    this.body = body
  }
}

// describe joins the top message with PocketBase's per-field validation errors.
function describe(status: number, body: Record<string, unknown>): string {
  const head = String(body.error || body.message || `HTTP ${status}`)
  const data = body.data
  if (!data || typeof data !== 'object') return head
  const fields = Object.entries(data as Record<string, { message?: string }>)
    .map(([name, issue]) => `${name}：${issue?.message ?? JSON.stringify(issue)}`)
  return [head, ...fields].join('\n')
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = session.token()
  if (token) headers.Authorization = token
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { message: text }
  }
  if (!response.ok) {
    if (response.status === 401 && token && !path.includes('/auth-')) session.signOut()
    throw new ApiError(response.status, (parsed ?? {}) as Record<string, unknown>)
  }
  return parsed as T
}

export interface BaseRecord {
  id: string
  created?: string
  updated?: string
  [field: string]: unknown
}

export async function listRecords<T extends BaseRecord = BaseRecord>(collection: string, query = ''): Promise<T[]> {
  const page = await request<{ items: T[] }>('GET', `/api/collections/${collection}/records?perPage=500&skipTotal=1${query ? `&${query}` : ''}`)
  return page.items
}

export function saveRecord(collection: string, id: string | undefined, body: Record<string, unknown>) {
  return id
    ? request<BaseRecord>('PATCH', `/api/collections/${collection}/records/${id}`, body)
    : request<BaseRecord>('POST', `/api/collections/${collection}/records`, body)
}

export function deleteRecord(collection: string, id: string) {
  return request<null>('DELETE', `/api/collections/${collection}/records/${id}`)
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
