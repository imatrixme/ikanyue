import { describe, expect, it } from 'vitest'

import { totals } from './traffic'

const minute = (route: string, count: number, s5xx: number, errors: number, p95: number) =>
  ({ route, service: 's', count, s4xx: 1, s5xx, errors, bytesOut: 1024, p95 })

describe('totals', () => {
  it('sums minutes per route, busiest first, and keeps the worst p95', () => {
    expect(totals([minute('a', 5, 1, 0, 30), minute('b', 20, 0, 0, 10), minute('a', 5, 0, 2, 90), minute('', 1, 0, 0, 5)])).toEqual([
      { route: 'b', count: 20, s4xx: 1, failures: 0, worstP95: 10, bytesOut: 1024 },
      { route: 'a', count: 10, s4xx: 2, failures: 3, worstP95: 90, bytesOut: 2048 },
      { route: '(未匹配)', count: 1, s4xx: 1, failures: 0, worstP95: 5, bytesOut: 1024 },
    ])
  })
})
