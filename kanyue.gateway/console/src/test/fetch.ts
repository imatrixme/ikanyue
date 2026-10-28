import { vi } from 'vitest'

export interface Call {
  method: string
  url: string
  body: unknown
}

type Reply = { status?: number; body: unknown } | ((call: Call) => { status?: number; body: unknown })

// mockFetch answers requests from routes keyed by "METHOD path-prefix" and
// records every call.
export function mockFetch(routes: Record<string, Reply>) {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = { method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const key = Object.keys(routes).find((route) => {
      const [method, prefix] = route.split(' ')
      return method === call.method && call.url.startsWith(prefix)
    })
    if (!key) return new Response(JSON.stringify({ message: 'not mocked' }), { status: 404 })
    const route = routes[key]
    const reply = typeof route === 'function' ? route(call) : route
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
  })
  return calls
}
