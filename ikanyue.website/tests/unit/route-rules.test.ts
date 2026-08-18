import { describe, expect, it } from 'vitest'
import { siteRouteRules } from '../../config/route-rules'

describe('website rendering boundaries', () => {
  it('renders API-backed pages at runtime instead of baking local data into the build', () => {
    expect(siteRouteRules['/']).toEqual({ swr: 300 })
    expect(siteRouteRules['/courses']).toEqual({ swr: 300 })
    expect(siteRouteRules['/courses/**']).toEqual({ swr: 300 })
    expect(siteRouteRules['/packages/**']).toEqual({ swr: 300 })
    expect(siteRouteRules['/activities']).toEqual({ swr: 300 })
    expect(siteRouteRules['/activities/**']).toEqual({ swr: 300 })
  })
})
