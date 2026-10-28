import { describe, expect, it } from 'vitest'

import { totals } from './traffic'

const minute = (stage: string, route: string, count: number, s5xx: number, errors: number, p95: number) =>
  ({ stage, group: 'mapi', route, service: 's', count, s4xx: 1, s5xx, errors, bytesOut: 1024, p95 })

describe('totals', () => {
  it('sums minutes per API and environment, busiest first, and keeps the worst p95', () => {
    expect(totals([
      minute('RELEASE', 'a', 5, 1, 0, 30), minute('RELEASE', 'b', 20, 0, 0, 10), minute('RELEASE', 'a', 5, 0, 2, 90),
      minute('TEST', 'a', 2, 0, 0, 7), minute('RELEASE', '', 1, 0, 0, 5),
    ])).toEqual([
      { stage: 'RELEASE', group: 'mapi', route: 'b', count: 20, s4xx: 1, failures: 0, worstP95: 10, bytesOut: 1024 },
      { stage: 'RELEASE', group: 'mapi', route: 'a', count: 10, s4xx: 2, failures: 3, worstP95: 90, bytesOut: 2048 },
      { stage: 'TEST', group: 'mapi', route: 'a', count: 2, s4xx: 1, failures: 0, worstP95: 7, bytesOut: 1024 },
      { stage: 'RELEASE', group: 'mapi', route: '(未匹配)', count: 1, s4xx: 1, failures: 0, worstP95: 5, bytesOut: 1024 },
    ])
  })
})
