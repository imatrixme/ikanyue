import { describe, expect, it } from 'vitest'
import { courses, faculty, fallbackActivities, learnerStories, primaryNav } from '~/data/site'
import { designTokens } from '~/utils/brand.generated'

describe('official website content contracts', () => {
  it('covers every required public destination', () => {
    expect(primaryNav.map(item => item.to)).toEqual([
      '/courses',
      '/faculty',
      '/activities',
      '/stories',
      '/about',
    ])
  })

  it('represents courses, teachers, learners and public activities', () => {
    expect(courses).toHaveLength(4)
    expect(courses.some(course => course.audience.includes('成人'))).toBe(true)
    expect(courses.some(course => course.audience.includes('儿童'))).toBe(true)
    expect(faculty).toHaveLength(3)
    expect(learnerStories).toHaveLength(3)
    expect(fallbackActivities.every(activity => activity.id && activity.startTime)).toBe(true)
  })

  it('consumes Token V2 component and ticket contracts', () => {
    expect(designTokens.breakpoints).toMatchObject({ xs: 320, md: 768, '2xl': 1440 })
    expect(designTokens.components.controlHeightPx.default).toBe(40)
    expect(designTokens.patterns.musicTicketPx.notch).toBe(8)
  })
})
