import { describe, expect, it } from 'vitest'
import { resolveActivityImage } from '~/utils/activity-media'

describe('activity photography', () => {
  it('replaces the current production illustrations with website photography', () => {
    expect(resolveActivityImage({ id: '702xy10zax9yg69' })).toBe('/images/vocal-performance.webp')
    expect(resolveActivityImage({ id: 'ck8wk6h9ks40u41' })).toBe('/images/vocal-community.webp')
    expect(resolveActivityImage({ id: 'c3e3r8gdk5mmim7' })).toBe('/images/vocal-adult.webp')
  })

  it('preserves uploaded photography for other activities', () => {
    expect(resolveActivityImage({ id: 'future', coverImageUrl: '/uploads/future.webp' })).toBe('/uploads/future.webp')
  })
})
