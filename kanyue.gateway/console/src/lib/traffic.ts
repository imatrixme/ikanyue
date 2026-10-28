// Minute is one per-minute series row from /gateway/v1/metrics.
export interface Minute {
  stage: string
  group: string
  route: string
  service: string
  count: number
  s4xx: number
  s5xx: number
  errors: number
  bytesOut: number
  p95: number
}

export interface RouteTotal {
  stage: string
  group: string
  route: string
  count: number
  s4xx: number
  failures: number
  worstP95: number
  bytesOut: number
}

// totals sums the minutes per API and environment, busiest first. Failures are 5xx answers
// plus requests that never got one (upstream errors).
export function totals(minutes: Minute[]): RouteTotal[] {
  const byRoute = new Map<string, RouteTotal>()
  for (const minute of minutes) {
    const route = minute.route || '(未匹配)'
    const key = `${minute.stage}/${minute.group}/${route}`
    const total = byRoute.get(key) ?? { stage: minute.stage, group: minute.group, route, count: 0, s4xx: 0, failures: 0, worstP95: 0, bytesOut: 0 }
    total.count += minute.count
    total.s4xx += minute.s4xx
    total.failures += minute.s5xx + minute.errors
    total.worstP95 = Math.max(total.worstP95, minute.p95)
    total.bytesOut += minute.bytesOut
    byRoute.set(key, total)
  }
  return [...byRoute.values()].sort((a, b) => b.count - a.count)
}
