import { describe, expect, it } from 'vitest'
import { normalizeActivityContent } from '../../server/utils/activity-content'

const baseActivity = {
  id: 'activity-test',
  title: '活动测试',
  startTime: '2026-08-01T10:00:00+08:00',
}

describe('activity content normalization', () => {
  it('creates a compact plain-text summary while preserving safe detail markup', () => {
    const activity = normalizeActivityContent({
      ...baseActivity,
      description: '<p>第一段活动介绍。</p><p>第二段包含 <strong>重点信息</strong>。</p>',
    })

    expect(activity.summary).toBe('第一段活动介绍。 第二段包含 重点信息。')
    expect(activity.descriptionHtml).toContain('<p>第一段活动介绍。</p>')
    expect(activity.descriptionHtml).toContain('<strong>重点信息</strong>')
    expect(activity.summary).not.toContain('<p>')
  })

  it('removes executable and unsafe markup before rendering activity details', () => {
    const activity = normalizeActivityContent({
      ...baseActivity,
      description: '<p onclick="alert(1)">安全内容</p><script>alert(2)</script><a href="javascript:alert(3)">链接</a>',
    })

    expect(activity.descriptionHtml).toContain('<p>安全内容</p>')
    expect(activity.descriptionHtml).not.toMatch(/onclick|script|javascript/i)
    expect(activity.summary).toBe('安全内容 链接')
  })

  it('keeps plain-text fallback descriptions readable', () => {
    const activity = normalizeActivityContent({
      ...baseActivity,
      description: '面向成人的声乐体验活动。',
    })

    expect(activity.summary).toBe('面向成人的声乐体验活动。')
    expect(activity.descriptionHtml).toBe('面向成人的声乐体验活动。')
  })

  it('caps list and SEO summaries while retaining the complete detail body', () => {
    const fullDescription = `<p>${'声乐训练内容。'.repeat(40)}</p>`
    const activity = normalizeActivityContent({ ...baseActivity, description: fullDescription })

    expect(Array.from(activity.summary || '')).toHaveLength(180)
    expect(activity.summary).toMatch(/…$/)
    expect(activity.descriptionHtml).toContain('声乐训练内容。'.repeat(40))
  })
})
