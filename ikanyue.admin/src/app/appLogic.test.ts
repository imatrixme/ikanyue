import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, createOpsApi } from './api'
import { scoreLocalAssessment } from './assessment'
import { filterList, mockProfiles, mockResources, mockTemplates } from './mockData'
import { appReducer, canAccessView, initialState } from './state'

describe('ops api clients', () => {
  it('mock api authenticates teacher/admin and rejects empty credentials', async () => {
    const api = createMockOpsApi()

    await expect(api.login('', '')).rejects.toThrow('手机号和密码不能为空')
    await expect(api.login('13800138001', 'secret')).resolves.toMatchObject({ profile: { role: 'teacher' } })
    await expect(api.login('13800138002', 'secret')).resolves.toMatchObject({ profile: { role: 'admin' } })
    await expect(api.listResource('students', 'token', { q: '小张' })).resolves.toMatchObject({ pagination: { totalItems: 1 } })
  })

  it('http api unwraps Hono response payloads and reports failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { token: 't', profile: mockProfiles.admin } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ code: 403, message: 'denied' }) })
    vi.stubGlobal('fetch', fetchMock)

    const api = createOpsApi({ mock: false, baseUrl: '/ops' })
    await expect(api.login('13800138002', 'secret')).resolves.toMatchObject({ token: 't' })
    await expect(api.dashboard('bad')).rejects.toThrow('denied')
    expect(fetchMock.mock.calls[0][0]).toBe('/ops/auth/login')

    vi.unstubAllGlobals()
  })

  it('http api builds query URLs and falls back to default error messages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { items: [], pagination: { totalItems: 0 } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { items: [], pagination: { totalItems: 0 } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { items: [], pagination: { totalItems: 0 } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { title: '报告' } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ code: 500 }) })
    vi.stubGlobal('fetch', fetchMock)

    const api = createOpsApi({ mock: false, baseUrl: '/ops' })
    await api.listResource('students', 'token', { q: '小张', status: 'active' })
    await api.listTemplates('token', { status: 'published' })
    await api.listReports('token', { q: '' })
    await api.viewShare('share-token')
    await expect(api.dashboard('token')).rejects.toThrow('运营后台请求失败')

    expect(fetchMock.mock.calls[0][0]).toBe('/ops/students?q=%E5%B0%8F%E5%BC%A0&status=active')
    expect(fetchMock.mock.calls[1][0]).toBe('/ops/assessment-templates?status=published')
    expect(fetchMock.mock.calls[2][0]).toBe('/ops/reports')
    expect(fetchMock.mock.calls[3][0]).toBe('/ops/share/share-token')

    vi.unstubAllGlobals()
  })
})

describe('app reducer and permissions', () => {
  it('handles login, cached payloads, view changes, toast, and logout', () => {
    const loggedIn = appReducer(initialState, {
      type: 'login:success',
      payload: { token: 'token', profile: mockProfiles.admin },
    })
    expect(loggedIn.profile?.isAdmin).toBe(true)
    expect(loggedIn.activeView).toBe('dashboard')

    const withView = appReducer(loggedIn, { type: 'view:set', payload: 'reports' })
    expect(withView.activeView).toBe('reports')

    expect(appReducer(withView, { type: 'login:start' }).loading).toBe(true)
    expect(appReducer(withView, { type: 'loading:set', payload: true }).loading).toBe(true)
    expect(appReducer(withView, { type: 'resource:set', resource: 'students', payload: mockResources.students }).resources.students).toBe(mockResources.students)
    expect(appReducer(withView, { type: 'templates:set', payload: mockTemplates }).templates).toBe(mockTemplates)
    expect(appReducer(withView, { type: 'reports:set', payload: { items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 0 } } }).reports?.items).toHaveLength(0)
    expect(appReducer(withView, { type: 'share:set', payload: { id: 'r', title: 't', student: { name: 's' }, teacher: { name: 't' }, score: { totalScore: 1, grade: 'A' }, generatedAt: '' } }).sharePreview?.title).toBe('t')
    expect(appReducer(withView, { type: 'unknown' } as never)).toBe(withView)

    const withDashboard = appReducer(withView, { type: 'dashboard:set', payload: { cards: [], pending: [] } })
    expect(withDashboard.loading).toBe(false)
    expect(appReducer(withDashboard, { type: 'toast:set', payload: { type: 'info', message: 'saved' } }).toast?.message).toBe('saved')
    expect(appReducer(withDashboard, { type: 'logout' })).toEqual(initialState)
  })

  it('guards admin-only views', () => {
    expect(canAccessView(null, 'dashboard')).toBe(false)
    expect(canAccessView(mockProfiles.teacher, 'teachers')).toBe(false)
    expect(canAccessView(mockProfiles.admin, 'teachers')).toBe(true)
    expect(canAccessView(mockProfiles.teacher, 'students')).toBe(true)
  })
})

describe('local assessment scoring', () => {
  it('scores weighted templates and resolves grade bands', () => {
    const template = mockTemplates.items[0]
    const score = scoreLocalAssessment(template, {
      pitch_stability: 'good',
      breath_support: 90,
      expression_score: 80,
      pitch_comment: 'ok',
    })

    expect(score.totalScore).toBe(87.5)
    expect(score.grade).toBe('B')
    expect(score.lines).toHaveLength(3)
  })

  it('scores rubric sum templates and ignores text-only items', () => {
    const template = {
      ...mockTemplates.items[1],
      schemaJson: {
        ...mockTemplates.items[1].schemaJson,
        sections: [
          ...mockTemplates.items[1].schemaJson.sections,
          { key: 'text', title: '文本', weight: 0, items: [{ key: 'note', label: '备注', type: 'textarea' as const }] },
        ],
      },
    }

    const score = scoreLocalAssessment(template, { rhythm_score: 120, note: 'good' })
    expect(score.totalScore).toBe(100)
    expect(score.grade).toBe('达标')
    expect(score.lines.at(-1)?.rawScore).toBe(0)
  })

  it('scores multi choice answers and empty filters', () => {
    const template = {
      ...mockTemplates.items[0],
      schemaJson: {
        sections: [{
          key: 'multi',
          title: '多选',
          weight: 1,
          items: [{
            key: 'habits',
            label: '练习习惯',
            type: 'multi_choice' as const,
            options: [{ value: 'a', label: 'A', score: 20 }, { value: 'b', label: 'B', score: 30 }],
          }],
        }],
        scoring: { type: 'weighted_sum' as const, maxScore: 100, gradeBands: [] },
      },
      scoringJson: { type: 'weighted_sum' as const, maxScore: 100, gradeBands: [] },
    }
    expect(scoreLocalAssessment(template, { habits: ['a', 'b'] }).totalScore).toBe(50)
    expect(scoreLocalAssessment(template, { habits: 'a' }).totalScore).toBe(0)
    expect(scoreLocalAssessment({ ...template, scoringJson: undefined } as never, { habits: ['missing'] }).grade).toBe('')
    expect(scoreLocalAssessment({
      ...template,
      schemaJson: {
        sections: [{ key: 'empty', title: '空多选', weight: 1, items: [{ key: 'empty', label: '空', type: 'multi_choice' as const }] }],
        scoring: { type: 'weighted_sum' as const, maxScore: 100, gradeBands: [] },
      },
    }, { empty: ['a'] }).totalScore).toBe(0)
    expect(filterList(mockResources.students, '').items).toHaveLength(3)
    expect(filterList(mockResources.students, '不存在').items).toHaveLength(0)
  })
})
