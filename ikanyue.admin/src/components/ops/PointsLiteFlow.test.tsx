import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { createMockOpsApi, type OpsApi } from '../../app/api'
import { mockPointEvents, mockProfiles, mockRewards, mockStudents } from '../../app/mockData'
import type { LoginResult, StudentPointSummary } from '../../app/types'
import { PointsWorkspace } from './PointsWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'

describe('points lite app flow', () => {
  it('uses row actions for grant, redemption, reward editing, and logout', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)
    await login(user)

    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('张同学')

    await user.click(screen.getAllByRole('button', { name: '为张同学增加积分' })[0])
    await user.clear(screen.getByLabelText('积分数量'))
    await user.type(screen.getByLabelText('积分数量'), '30')
    await user.click(screen.getByRole('button', { name: '复核加分结果' }))
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toHaveTextContent('150')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('积分已增加')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('150 分')

    await user.click(screen.getAllByRole('button', { name: '为张同学线下兑换' })[0])
    await user.click(screen.getByRole('button', { name: '复核兑换结果' }))
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toHaveTextContent('贴纸套装')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('已扣除积分，确认线下领取')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('100 分')

    await user.click(screen.getByRole('button', { name: '实物管理' }))
    await user.click(screen.getAllByRole('button', { name: '编辑贴纸套装' })[0])
    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'sticker.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /上传图片|替换图片/ }))
    expect(await screen.findByText('实物图片已上传')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('积分价格'))
    await user.type(screen.getByLabelText('积分价格'), '60')
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(await screen.findByText('实物已更新')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('60 分')

    await user.click(screen.getByRole('button', { name: '新增实物' }))
    await user.type(screen.getByLabelText('实物名称'), '帆布袋')
    await user.clear(screen.getByLabelText('积分价格'))
    await user.type(screen.getByLabelText('积分价格'), '90')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(await screen.findByText('实物已创建')).toBeInTheDocument()
    expect((await screen.findAllByText('帆布袋')).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(screen.getByRole('heading', { name: '看乐积分兑换后台' })).toBeInTheDocument()
  })

  it('shows login validation and blocks non-admin users', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByText('账号和密码不能为空')).toBeInTheDocument()
    await user.type(screen.getByLabelText('账号或手机号'), '13800138001')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByText('积分兑换后台仅允许管理员访问')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '需要管理员权限' })).toBeInTheDocument()
  })

  it('handles forced password changes and cached-session parse errors', async () => {
    localStorage.setItem('kanyue.points-lite.session', '{bad-json')
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'login').mockResolvedValueOnce({ token: 'token', profile: { ...mockProfiles.admin, passwordChangeRequired: true } })
    render(<App api={api} />)
    await login(user)
    expect(await screen.findByRole('heading', { name: '修改初始密码' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('当前密码'), 'old-secret')
    await user.type(screen.getByLabelText('新密码'), 'new-secret')
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()
  })

  it('keeps dialogs open when grant, redemption, save, or upload fails', async () => {
    const user = userEvent.setup()
    const api = createFailingApi()
    api.listStudents = async () => mockStudents
    api.listRewards = async () => mockRewards
    render(<App api={api} />)
    await login(user)
    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()

    api.addPoints = async () => { throw new Error('grant down') }
    await user.click(screen.getAllByRole('button', { name: '为张同学增加积分' })[0])
    await user.click(screen.getByRole('button', { name: '复核加分结果' }))
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('grant down')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    api.offlineRedeem = async () => { throw new Error('redeem down') }
    await user.click(screen.getAllByRole('button', { name: '为张同学线下兑换' })[0])
    await user.click(screen.getByRole('button', { name: '复核兑换结果' }))
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('redeem down')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    await user.click(screen.getByRole('button', { name: '实物管理' }))
    api.createReward = async () => { throw new Error('save down') }
    await user.click(screen.getByRole('button', { name: '新增实物' }))
    await user.type(screen.getByLabelText('实物名称'), '新奖品')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(await screen.findByText('save down')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '新增实物' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getByRole('button', { name: '放弃修改' }))

    await user.click(screen.getAllByRole('button', { name: '编辑贴纸套装' })[0])
    api.uploadRewardImage = async () => { throw new Error('upload down') }
    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'failed.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /上传图片|替换图片/ }))
    expect(await screen.findByText('upload down')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '编辑贴纸套装' })).toBeInTheDocument()
  })

  it('surfaces initial learner load failures without hiding the page shell', async () => {
    const user = userEvent.setup()
    render(<App api={createFailingApi()} />)
    await login(user)
    expect(await screen.findByText('students down')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '学员积分' })).toBeInTheDocument()
  })

  it('restores a valid cached session and tolerates an empty first page', async () => {
    localStorage.setItem('kanyue.points-lite.session', JSON.stringify({ token: 'cached-token', profile: mockProfiles.admin }))
    const api = createMockOpsApi()
    api.listStudents = vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 } })
    api.listRewards = vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 } })
    api.getStudentPoints = vi.fn(api.getStudentPoints)
    render(<App api={api} />)
    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()
    expect(screen.getByText('还没有学员')).toBeInTheDocument()
    expect(api.getStudentPoints).not.toHaveBeenCalled()
  })

  it('reports reward and summary load failures independently', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.listStudents = vi.fn().mockResolvedValue(mockStudents)
    api.listRewards = vi.fn().mockRejectedValue(new Error('rewards unavailable'))
    api.getStudentPoints = vi.fn().mockRejectedValue(new Error('summary unavailable'))
    render(<App api={api} />)
    await login(user)
    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()
    await waitFor(() => expect(api.listRewards).toHaveBeenCalled())
    await waitFor(() => expect(api.getStudentPoints).toHaveBeenCalledWith('mock-token-admin_1', 'student_1'))
    expect(screen.getByRole('table')).toHaveTextContent('张同学')
  })

  it('keeps forced password change open when the API rejects it', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'login').mockResolvedValueOnce({ token: 'token', profile: { ...mockProfiles.admin, passwordChangeRequired: true } })
    vi.spyOn(api, 'changePassword').mockRejectedValueOnce(new Error('password rejected'))
    render(<App api={api} />)
    await login(user)
    await user.type(screen.getByLabelText('当前密码'), 'old-secret')
    await user.type(screen.getByLabelText('新密码'), 'new-secret')
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(await screen.findByText('password rejected')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '修改初始密码' })).toBeInTheDocument()
  })

  it('allows a reward draft to save while the initial reward list is still pending', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.listRewards = vi.fn(() => new Promise<Awaited<ReturnType<OpsApi['listRewards']>>>(() => undefined))
    render(<App api={api} />)
    await login(user)
    expect(await screen.findByRole('heading', { name: '学员积分' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '实物管理' }))
    await user.click(screen.getAllByRole('button', { name: '新增实物' })[0])
    await user.type(screen.getByLabelText('实物名称'), '待加载奖品')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(await screen.findByText('实物已创建')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('merges a reward when the backend omits pagination metadata', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    api.listRewards = vi.fn().mockResolvedValue({ items: mockRewards.items } as Awaited<ReturnType<OpsApi['listRewards']>>)
    render(<App api={api} />)
    await login(user)
    await screen.findByRole('heading', { name: '学员积分' })
    await user.click(screen.getByRole('button', { name: '实物管理' }))
    await user.click(screen.getAllByRole('button', { name: '编辑贴纸套装' })[0])
    await user.clear(screen.getByLabelText('积分价格'))
    await user.type(screen.getByLabelText('积分价格'), '55')
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(await screen.findByText('实物已更新')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('55 分')
  })
})

describe('list-first scene components', () => {
  it('filters learners, opens detail, and preserves grant data when returning from review', async () => {
    const user = userEvent.setup()
    const onAddPoints = vi.fn().mockResolvedValue(true)
    render(<PointsWorkspace {...workspaceProps({ onAddPoints })} />)
    await user.type(screen.getByLabelText('搜索学员'), '李')
    expect(screen.getByRole('table')).toHaveTextContent('李同学')
    expect(screen.getByRole('table')).not.toHaveTextContent('张同学')
    await user.click(screen.getByRole('button', { name: '重置' }))

    await user.click(screen.getAllByRole('button', { name: '查看张同学详情' })[0])
    expect(await screen.findByRole('dialog', { name: '张同学积分详情' })).toHaveTextContent('贴纸套装')
    expect(screen.getByRole('dialog', { name: '张同学积分详情' })).toHaveTextContent('课堂奖励')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    await user.click(screen.getAllByRole('button', { name: '为张同学增加积分' })[0])
    await user.clear(screen.getByLabelText('积分数量'))
    await user.type(screen.getByLabelText('积分数量'), '15')
    await user.clear(screen.getByLabelText('原因'))
    await user.type(screen.getByLabelText('原因'), '主动练习')
    await user.click(screen.getByRole('button', { name: '复核加分结果' }))
    expect(onAddPoints).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '返回修改' }))
    expect(screen.getByLabelText('积分数量')).toHaveValue(15)
    expect(screen.getByLabelText('原因')).toHaveValue('主动练习')
  })

  it('edits rewards, protects dirty forms, and keeps media fallback stable', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const reward = { ...mockRewards.items[0] }
    const onSave = vi.fn().mockResolvedValue(true)
    const onUploadImage = vi.fn(async (_id: string, _file: File, onProgress?: (percent: number) => void) => { onProgress?.(45); return { ...reward, image: 'https://assets.test/reward.png' } })
    render(<RewardItemsPanel loading={false} onReloadRewards={vi.fn()} onSave={onSave} onUploadImage={onUploadImage} rewards={[reward]} />)
    await user.click(screen.getAllByRole('button', { name: '编辑贴纸套装' })[0])
    await user.clear(screen.getByLabelText('说明'))
    await user.type(screen.getByLabelText('说明'), '前台领取')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    expect(screen.getByText('放弃未保存修改？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText('说明')).toHaveValue('前台领取')

    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'reward.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /上传图片|替换图片/ }))
    expect(await screen.findByRole('progressbar', { name: '上传进度' })).toHaveValue(100)
    fireEvent.error(screen.getByAltText('实物图片预览'))
    expect(screen.getByText('图片不可用')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(onSave).toHaveBeenCalledWith('reward_sticker', expect.objectContaining({ description: '前台领取' }))
  })
})

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('账号或手机号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'secret')
  await user.click(screen.getByRole('button', { name: /^登录$/ }))
}

function workspaceProps(overrides: Partial<React.ComponentProps<typeof PointsWorkspace>> = {}): React.ComponentProps<typeof PointsWorkspace> {
  return { loading: false, rewards: mockRewards.items, selectedStudentId: 'student_1', studentSummary: summary(120), students: mockStudents.items, onAddPoints: vi.fn(), onLoadStudent: async (id) => summary(id === 'student_1' ? 120 : 40, id), onRedeem: vi.fn(), onReloadStudents: vi.fn(), ...overrides }
}

function summary(balance: number, studentId = 'student_1'): StudentPointSummary { return { balance, events: mockPointEvents.filter((event) => event.studentId === studentId), pagination: { page: 1, perPage: 20, totalItems: 2, totalPages: 1 }, studentId } }

function createFailingApi(): OpsApi {
  return { login: async (): Promise<LoginResult> => ({ token: 'token', profile: mockProfiles.admin }), register: async () => ({ status: 'pending_activation', message: 'ok', profile: mockProfiles.teacher }), changePassword: async () => ({ token: 'token', profile: mockProfiles.admin }), listManagedStudents: async () => ({ items: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 } }), createStudent: async () => { throw new Error('student create down') }, updateStudent: async () => { throw new Error('student update down') }, listStudents: async () => { throw new Error('students down') }, getStudentPoints: async () => summary(120), addPoints: async () => summary(120), offlineRedeem: async () => summary(120), listRewards: async () => mockRewards, createReward: async (_token, data) => ({ id: 'created', description: '', image: '', status: 'active', ...data }), updateReward: async (_token, id, data) => ({ id, description: '', image: '', status: 'active', ...data }), uploadRewardImage: async (_token, id) => ({ id, name: '图片实物', description: '', image: 'https://assets.test/image.png', pointsPrice: 10, status: 'active' }) }
}
