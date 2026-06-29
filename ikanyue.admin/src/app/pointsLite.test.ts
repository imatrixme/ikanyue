import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, createOpsApi } from './api'
import { appReducer, canAccessView, initialState } from './state'
import { mockProfiles, mockStudents } from './mockData'
import type { LoginResult } from './types'

describe('points lite api', () => {
  it('mock api grants points, redeems rewards, and keeps unavailable rewards blocked', async () => {
    const api = createMockOpsApi()
    const login = await api.login('admin', 'secret')
    expect(login.profile.isAdmin).toBe(true)

    const students = await api.listStudents(login.token, { q: '张' })
    expect(students.items).toHaveLength(1)
    expect(students.items[0].balance).toBe(120)

    const added = await api.addPoints(login.token, { studentId: 'student_1', amount: 30, reason: '课堂奖励' })
    expect(added.balance).toBe(150)
    expect(added.events[0]).toMatchObject({ delta: 30, type: 'earn' })
    const defaultReason = await api.addPoints(login.token, { studentId: 'student_1', amount: 1 })
    expect(defaultReason.events[0]).toMatchObject({ reason: 'admin_grant', remark: '' })

    const redeemed = await api.offlineRedeem(login.token, { studentId: 'student_1', itemId: 'reward_sticker' })
    expect(redeemed.balance).toBe(101)
    expect(redeemed.reward?.name).toBe('贴纸套装')
    expect(redeemed.events[0]).toMatchObject({ delta: -50, type: 'offline_redeem' })
    expect(redeemed.events[0].remark).toBe('')
    expect((await api.listRewards(login.token, { status: 'active' })).items.every((item) => item.status === 'active')).toBe(true)

    await expect(api.offlineRedeem(login.token, { studentId: 'student_1', itemId: 'reward_hidden' })).rejects.toThrow('实物已下线')
    await expect(api.offlineRedeem(login.token, { studentId: 'student_2', itemId: 'reward_book' })).rejects.toThrow('积分不足')
  })

  it('validates auth, reward mutations, and missing records in the mock api', async () => {
    const api = createMockOpsApi()

    await expect(api.login('', '')).rejects.toThrow('账号和密码不能为空')
    await expect(api.register({ cellphone: '', password: '', realName: '' })).rejects.toThrow('手机号、姓名和密码不能为空')
    await expect(api.changePassword('token', { currentPassword: '', newPassword: '', confirmPassword: '' })).rejects.toThrow('当前密码和新密码不能为空')
    await expect(api.changePassword('token', { currentPassword: 'old', newPassword: 'new-1', confirmPassword: 'new-2' })).rejects.toThrow('两次输入的新密码不一致')

    const registered = await api.register({ cellphone: '13900000000', password: 'secret123', realName: '新老师' })
    expect(registered.profile.blocked).toBe(true)

    await expect(api.getStudentPoints('token', 'missing')).rejects.toThrow('学员不存在')
    await expect(api.addPoints('token', { studentId: 'student_1', amount: 0 })).rejects.toThrow('积分必须为正整数')

    const created = await api.createReward('token', { name: '帆布袋', pointsPrice: 90, status: 'active' })
    expect(created).toMatchObject({ name: '帆布袋', pointsPrice: 90 })
    const updated = await api.updateReward('token', created.id, { ...created, status: 'inactive', pointsPrice: 100 })
    expect(updated.status).toBe('inactive')
    await expect(api.createReward('token', { name: '', pointsPrice: 1 })).rejects.toThrow('实物名称不能为空')
    await expect(api.createReward('token', { name: '无效', pointsPrice: 0 })).rejects.toThrow('实物积分价格必须为正整数')
    await expect(api.updateReward('token', 'missing', { name: '缺失', pointsPrice: 1 })).rejects.toThrow('实物不存在')
  })

  it('http api calls the points-lite endpoints only', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ token: 'token', profile: mockProfiles.admin }))
      .mockResolvedValueOnce(ok({ status: 'pending_activation', message: 'ok', profile: mockProfiles.teacher }))
      .mockResolvedValueOnce(ok({ token: 'changed', profile: mockProfiles.admin }))
      .mockResolvedValueOnce(ok(mockStudents))
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 120, events: [], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 130, events: [], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 80, events: [], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok({ items: [], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok({ id: 'reward_1', name: '贴纸', pointsPrice: 10, status: 'active', description: '', image: '' }))
      .mockResolvedValueOnce(ok({ id: 'reward_1', name: '贴纸', pointsPrice: 20, status: 'inactive', description: '', image: '' }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 400, message: '业务失败' }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = createOpsApi({ baseUrl: '/ops', mock: false })

    await api.login('admin', 'secret')
    await api.register({ cellphone: '1', password: 'p', realName: 'r' })
    await api.changePassword('token', { currentPassword: 'old', newPassword: 'new', confirmPassword: 'new' })
    await api.listStudents('token', { q: '张', keyword: '', page: 1, perPage: undefined })
    await api.getStudentPoints('token', 'student_1')
    await api.addPoints('token', { studentId: 'student_1', amount: 10 })
    await api.offlineRedeem('token', { studentId: 'student_1', itemId: 'reward_1' })
    await api.listRewards('token')
    await api.createReward('token', { name: '贴纸', pointsPrice: 10 })
    await api.updateReward('token', 'reward_1', { name: '贴纸', pointsPrice: 20, status: 'inactive' })
    await expect(api.listRewards('token')).rejects.toThrow('业务失败')

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/ops/auth/login',
      '/ops/auth/register',
      '/ops/auth/change-password',
      '/ops/points/students?q=%E5%BC%A0&page=1',
      '/ops/points/students/student_1',
      '/ops/points/students/student_1/earn',
      '/ops/points/offline-redeem',
      '/ops/reward-items',
      '/ops/reward-items',
      '/ops/reward-items/reward_1',
      '/ops/reward-items',
    ])
  })

  it('uses the default http error when the backend does not return a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 500 }) }))
    const api = createOpsApi({ baseUrl: '/ops', mock: false })

    await expect(api.listRewards('token')).rejects.toThrow('运营后台请求失败')
  })

  it('uses the mock api when explicitly requested', async () => {
    const api = createOpsApi({ mock: true })

    await expect(api.login('admin', 'secret')).resolves.toMatchObject({
      profile: { isAdmin: true },
    })
  })
})

describe('points lite reducer', () => {
  it('keeps the app on the admin-only points surface', () => {
    const login: LoginResult = { token: 'token', profile: mockProfiles.admin }
    let state = appReducer(initialState, { type: 'login:success', payload: login })
    expect(state.activeView).toBe('points')
    expect(canAccessView(mockProfiles.admin, 'rewards')).toBe(true)
    expect(canAccessView(mockProfiles.teacher, 'points')).toBe(false)

    state = appReducer(state, { type: 'students:set', payload: mockStudents })
    expect(state.selectedStudentId).toBe('student_1')
    state = appReducer(state, { type: 'student:select', payload: 'student_2' })
    expect(state.selectedStudentSummary).toBeNull()
    state = appReducer(state, { type: 'toast:set', payload: { type: 'info', message: 'ok' } })
    expect(state.loading).toBe(false)
    state = appReducer(state, { type: 'login:start' })
    expect(state.loading).toBe(true)
    expect(state.toast).toBeNull()
    state = appReducer({ ...state, selectedStudentId: 'student_2' }, { type: 'students:set', payload: mockStudents })
    expect(state.selectedStudentId).toBe('student_2')
    state = appReducer({ ...state, selectedStudentId: '' }, { type: 'students:set', payload: { ...mockStudents, items: [] } })
    expect(state.selectedStudentId).toBe('')
    expect(appReducer(state, { type: 'unknown' } as never)).toBe(state)
    expect(appReducer(state, { type: 'logout' })).toBe(initialState)
  })
})

function ok(data: unknown) {
  return {
    ok: true,
    json: async () => ({ code: 10000, data }),
  }
}
