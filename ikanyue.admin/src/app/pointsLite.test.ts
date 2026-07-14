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
    const progress: number[] = []
    const uploaded = await api.uploadRewardImage('token', created.id, new File(['image'], 'bag.png', { type: 'image/png' }), (value) => progress.push(value))
    expect(uploaded.image).toContain('bag.png')
    expect(progress).toEqual([100])
    await expect(api.uploadRewardImage('token', 'missing', new File(['image'], 'missing.png', { type: 'image/png' }))).rejects.toThrow('实物不存在')
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
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 130, event: { id: 'event_earn' } }))
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 130, events: [], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok({ studentId: 'student_1', balance: 80, event: { id: 'event_redeem' } }))
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
      '/ops/points/students/student_1',
      '/ops/points/offline-redeem',
      '/ops/points/students/student_1',
      '/ops/reward-items',
      '/ops/reward-items',
      '/ops/reward-items/reward_1',
      '/ops/reward-items',
    ])
  })

  it('http api calls the lightweight student-management endpoints', async () => {
    const student = { id: 'student_9', realName: '新学员', nickName: '', cellphone: '13900139009', avatar: '', blocked: false, lastLoginAt: '', created: '', updated: '' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ items: [student], pagination: mockStudents.pagination }))
      .mockResolvedValueOnce(ok(student))
      .mockResolvedValueOnce(ok({ ...student, blocked: true }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createOpsApi({ baseUrl: '/ops', mock: false })

    await api.listManagedStudents('token', { status: 'active', perPage: 100 })
    await api.createStudent('token', { realName: '新学员', cellphone: '13900139009', password: 'secret', blocked: false })
    await api.updateStudent('token', student.id, { realName: '新学员', cellphone: '13900139009', password: '', blocked: true })

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/ops/students?status=active&perPage=100',
      '/ops/students',
      '/ops/students/student_9',
    ])
  })

  it('mock student management validates fields, filters status, and updates records', async () => {
    const api = createMockOpsApi()
    expect((await api.listManagedStudents('token', { q: '张', status: 'active', page: 1, limit: 10 })).items).toHaveLength(1)
    expect((await api.listManagedStudents('token', { status: 'all' })).items).toHaveLength(2)
    await expect(api.createStudent('token', { realName: '', cellphone: '', password: '', blocked: false })).rejects.toThrow('手机号不能为空')
    await expect(api.createStudent('token', { realName: '', cellphone: '13900139009', password: 'secret', blocked: false })).rejects.toThrow('学员姓名不能为空')
    await expect(api.createStudent('token', { realName: '新学员', cellphone: '13900139009', password: '', blocked: false })).rejects.toThrow('初始密码不能为空')
    await expect(api.createStudent('token', { realName: '重复', cellphone: '13900139001', password: 'secret', blocked: false })).rejects.toThrow('手机号已注册')

    const created = await api.createStudent('token', { realName: '新学员', cellphone: '13900139009', password: 'secret', blocked: false })
    expect(created.nickName).toBe('')
    const updated = await api.updateStudent('token', created.id, { realName: '新学员改', nickName: '新昵称', cellphone: '13900139009', password: '', blocked: true })
    expect(updated).toMatchObject({ realName: '新学员改', blocked: true })
    expect((await api.listManagedStudents('token', { keyword: '新昵称', status: 'inactive', perPage: 5 })).items).toHaveLength(1)
    await api.updateStudent('token', created.id, { realName: '新学员改', nickName: '新昵称', cellphone: '13900139009', password: '', blocked: false })
    expect((await api.listStudents('token')).items.some((student) => student.id === created.id)).toBe(true)
    await expect(api.updateStudent('token', 'missing', { realName: '缺失', cellphone: '13900139008', password: '', blocked: false })).rejects.toThrow('学员不存在')
    await expect(api.updateStudent('token', created.id, { realName: '重复', cellphone: '13900139001', password: '', blocked: false })).rejects.toThrow('手机号已注册')
  })

  it('uses the default http error when the backend does not return a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 500 }) }))
    const api = createOpsApi({ baseUrl: '/ops', mock: false })

    await expect(api.listRewards('token')).rejects.toThrow('运营后台请求失败')
  })

  it('uploads images with progress and reports upload transport failures', async () => {
    const scenarios = [
      { status: 200, body: JSON.stringify({ code: 10000, data: { id: 'reward_1', image: 'https://assets.test/reward.png' } }) },
      { status: 400, body: JSON.stringify({ code: 400, message: '图片格式错误' }) },
      { status: 200, body: 'not-json' },
      { networkError: true },
    ]
    const requests: FakeXhr[] = []
    class FakeXhr {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      responseText = ''
      status = 0
      url = ''
      headers: Record<string, string> = {}
      body: FormData | null = null

      constructor() {
        requests.push(this)
      }

      open(_method: string, url: string) {
        this.url = url
      }

      setRequestHeader(name: string, value: string) {
        this.headers[name] = value
      }

      send(body: FormData) {
        this.body = body
        const scenario = scenarios.shift()
        if (scenario?.networkError) {
          this.onerror?.()
          return
        }
        this.status = scenario?.status || 500
        this.responseText = scenario?.body || ''
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent)
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const api = createOpsApi({ baseUrl: '/ops', mock: false })
    const file = new File(['image'], 'reward.png', { type: 'image/png' })
    const progress: number[] = []

    await expect(api.uploadRewardImage('token', 'reward_1', file, (value) => progress.push(value))).resolves.toMatchObject({ image: 'https://assets.test/reward.png' })
    expect(progress).toEqual([0, 50, 100])
    expect(requests[0].url).toBe('/ops/reward-items/reward_1/image')
    expect(requests[0].headers.authorization).toBe('Bearer token')
    expect(requests[0].body?.get('imageFile')).toBe(file)

    await expect(api.uploadRewardImage('token', 'reward_1', file)).rejects.toThrow('图片格式错误')
    await expect(api.uploadRewardImage('token', 'reward_1', file)).rejects.toThrow('无效响应')
    await expect(api.uploadRewardImage('token', 'reward_1', file)).rejects.toThrow('检查网络')
    vi.unstubAllGlobals()
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
    expect(canAccessView(mockProfiles.admin, 'students')).toBe(true)
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
    state = appReducer(state, { type: 'managedStudents:error', payload: 'load failed' })
    expect(state.managedStudentsError).toBe('load failed')
    state = appReducer(state, { type: 'managedStudents:set', payload: { items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 } } })
    expect(state.managedStudentsError).toBe('')
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
