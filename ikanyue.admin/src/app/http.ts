export async function request<T>(url: string, options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  if (options.token) headers.authorization = `Bearer ${options.token}`

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json()
  if (!response.ok || payload.code !== 10000) throw new Error(payload.message || '运营后台请求失败')
  return payload.data as T
}

export function toQuery(query: object): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}
