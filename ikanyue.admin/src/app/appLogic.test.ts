import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, createOpsApi } from './api'
import { scoreLocalAssessment } from './assessment'
import { filterList, mockProfiles, mockResources, mockTemplates } from './mockData'
import { defaultResourcePayload } from './resourceDefaults'
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'activity_1', title: '活动' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'activity_1', title: '活动更新' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'template_1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'template_1', status: 'published' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'assessment_1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'assessment_1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { report: { id: 'report_1' } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'share_1', token: 'share-token' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { id: 'share_1', revokedAt: 'now' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 10000, data: { title: '报告' } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ code: 500 }) })
    vi.stubGlobal('fetch', fetchMock)

    const api = createOpsApi({ mock: false, baseUrl: '/ops' })
    await api.listResource('students', 'token', { q: '小张', status: 'active' })
    await api.listTemplates('token', { status: 'published' })
    await api.listReports('token', { q: '' })
    await api.createResource('activities', 'token', { title: '活动' })
    await api.updateResource('activities', 'activity_1', 'token', { title: '活动更新' })
    await api.createTemplate('token', { name: '模板' })
    await api.publishTemplate('token', 'template_1')
    await api.createAssessment('token', { templateId: 'template_1', studentId: 'student_1' })
    await api.saveAssessment('token', 'assessment_1', { answersJson: { pitch: 1 } })
    await api.submitAssessment('token', 'assessment_1', { answersJson: { pitch: 1 } })
    await api.createShareLink('token', 'report_1')
    await api.revokeShareLink('token', 'share_1')
    await api.viewShare('share-token')
    await expect(api.dashboard('token')).rejects.toThrow('运营后台请求失败')

    expect(fetchMock.mock.calls[0][0]).toBe('/ops/students?q=%E5%B0%8F%E5%BC%A0&status=active')
    expect(fetchMock.mock.calls[1][0]).toBe('/ops/assessment-templates?status=published')
    expect(fetchMock.mock.calls[2][0]).toBe('/ops/reports')
    expect(fetchMock.mock.calls[3][0]).toBe('/ops/activities')
    expect(fetchMock.mock.calls[4][0]).toBe('/ops/activities/activity_1')
    expect(fetchMock.mock.calls[5][0]).toBe('/ops/assessment-templates')
    expect(fetchMock.mock.calls[6][0]).toBe('/ops/assessment-templates/template_1/publish')
    expect(fetchMock.mock.calls[7][0]).toBe('/ops/assessments')
    expect(fetchMock.mock.calls[8][0]).toBe('/ops/assessments/assessment_1/save')
    expect(fetchMock.mock.calls[9][0]).toBe('/ops/assessments/assessment_1/submit')
    expect(fetchMock.mock.calls[10][0]).toBe('/ops/reports/report_1/share-links')
    expect(fetchMock.mock.calls[11][0]).toBe('/ops/share-links/share_1/revoke')
    expect(fetchMock.mock.calls[12][0]).toBe('/ops/share/share-token')

    vi.unstubAllGlobals()
  })

  it('mock api mutates resources, templates, assessments, reports, and shares', async () => {
    const api = createMockOpsApi()
    const createdActivity = await api.createResource('activities', 'token', { title: '新增活动', status: 'draft' })
    await expect(api.updateResource('activities', createdActivity.id, 'token', { status: 'active' })).resolves.toMatchObject({ status: 'active' })
    await expect(api.updateResource('activities', 'missing', 'token', {})).rejects.toThrow('记录不存在')

    const createdTemplate = await api.createTemplate('token', { name: '新模板' })
    await expect(api.publishTemplate('token', createdTemplate.id)).resolves.toMatchObject({ status: 'published' })
    await expect(api.publishTemplate('token', 'missing')).rejects.toThrow('模板不存在')

    const draft = await api.createAssessment('token', { templateId: 'template_1', studentId: 'student_1', answersJson: { breath_support: 90 } })
    await expect(api.saveAssessment('token', draft.id, { answersJson: { breath_support: 91 } })).resolves.toMatchObject({ answersJson: { breath_support: 91 } })
    await expect(api.saveAssessment('token', 'missing', { answersJson: { breath_support: 1 } })).rejects.toThrow('评估记录不存在')
    const submitted = await api.submitAssessment('token', draft.id, { answersJson: { pitch_stability: 'good', breath_support: 90, expression_score: 80 } })
    expect(submitted.report.id).toMatch(/^report_/)
    await expect(api.submitAssessment('token', 'missing')).rejects.toThrow('评估记录不存在')

    const share = await api.createShareLink('token', submitted.report.id)
    await expect(api.viewShare(share.token)).resolves.toMatchObject({ title: '声乐阶段评估报告', score: { totalScore: submitted.report.totalScore } })
    await expect(api.revokeShareLink('token', share.id)).resolves.toHaveProperty('revokedAt')
    await expect(api.revokeShareLink('token', 'missing')).rejects.toThrow('分享链接不存在')
  })

  it('uses the explicit mock option over environment defaults', async () => {
    const api = createOpsApi({ mock: true })
    await expect(api.dashboard('token')).resolves.toMatchObject({ cards: expect.any(Array) })
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

  it('creates default payloads for all managed resource types', () => {
    expect(defaultResourcePayload('students')).toMatchObject({ nickName: '新学员', blocked: false })
    expect(defaultResourcePayload('teachers')).toMatchObject({ verified: false, isAdmin: false })
    expect(defaultResourcePayload('activities')).toMatchObject({ type: 'open-class', status: 'draft' })
    expect(defaultResourcePayload('audioMaterials')).toMatchObject({ difficulty: 'L1', status: 'draft' })
    expect(defaultResourcePayload('videoMaterials')).toMatchObject({ resolution: '1080p', status: 'draft' })
    expect(defaultResourcePayload('operationSlots')).toMatchObject({ channel: 'wechat-mini', targetType: 'none' })
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
