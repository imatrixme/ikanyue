import { describe, expect, it } from 'vitest'
import { courses, fallbackActivities, learnerJourneys, primaryNav, teachingRoles } from '~/data/site'
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

  it('represents every vocal learning life stage without invented profiles', () => {
    expect(courses).toHaveLength(6)
    expect(courses.map(course => course.audience).join(' ')).toContain('4-6')
    expect(courses.map(course => course.audience).join(' ')).toContain('12-17')
    expect(courses.map(course => course.audience).join(' ')).toContain('18-44')
    expect(courses.map(course => course.audience).join(' ')).toContain('45')
    expect(courses.every(course => course.image.startsWith('/images/vocal-'))).toBe(true)
    expect(teachingRoles).toHaveLength(3)
    expect(learnerJourneys).toHaveLength(5)
    expect(learnerJourneys.every(journey => journey.milestones.length === 3)).toBe(true)
    expect(fallbackActivities.every(activity => activity.id && activity.startTime)).toBe(true)
  })

  it('keeps fallback activities inside the vocal domain', () => {
    const content = JSON.stringify(fallbackActivities)
    expect(content).toContain('声乐')
    expect(content).not.toMatch(/钢琴|吉他|乐器|piano|guitar|instrument/i)
  })

  it('consumes Token V2 component and ticket contracts', () => {
    expect(designTokens.breakpoints).toMatchObject({ xs: 320, md: 768, '2xl': 1440 })
    expect(designTokens.components.controlHeightPx.default).toBe(40)
    expect(designTokens.components.iconSizePx.lg).toBe(20)
    expect(designTokens.patterns.musicTicketPx.notch).toBe(8)
  })
})
