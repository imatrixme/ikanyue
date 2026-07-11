import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { createMockOpsApi, type OpsApi } from '../../app/api'
import { mockProfiles, mockRewards, mockStudents } from '../../app/mockData'
import type { LoginResult, RewardItem, StudentPointSummary } from '../../app/types'
import { PointsWorkspace } from './PointsWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'

describe('points lite app flow', () => {
  it('logs in, grants points, redeems an item, edits rewards, and logs out', async () => {
    const user = userEvent.setup()
    render(<App api={createMockOpsApi()} />)

    expect(screen.getByRole('heading', { name: '看乐积分兑换后台' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))

    expect(await screen.findByRole('heading', { name: '选择学员' })).toBeInTheDocument()
    expect(screen.getAllByText('张同学').length).toBeGreaterThan(0)
    expect(screen.getAllByText('120').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /李同学40 分/ }))
    expect(screen.getAllByText('40').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /张同学120 分/ }))

    await user.clear(screen.getByLabelText('积分数量'))
    await user.type(screen.getByLabelText('积分数量'), '30')
    await user.click(screen.getByRole('button', { name: '预览加分结果' }))
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toHaveTextContent('120')
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toHaveTextContent('150')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('积分已增加')).toBeInTheDocument()
    expect(screen.getAllByText('150').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    await user.click(screen.getByRole('button', { name: '预览兑换结果' }))
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toHaveTextContent('贴纸套装')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('已扣除积分，确认线下领取')).toBeInTheDocument()
    expect(screen.getAllByText('100').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '实物管理' }))
    expect(await screen.findByRole('heading', { name: '实物管理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'sticker.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: '替换图片' }))
    expect(await screen.findByText('实物图片已上传')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('积分价格'))
    await user.type(screen.getByLabelText('积分价格'), '60')
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(await screen.findByText('实物已更新')).toBeInTheDocument()
    expect(screen.getByText('60 分')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新增实物' }))
    await user.clear(screen.getByLabelText('实物名称'))
    await user.type(screen.getByLabelText('实物名称'), '帆布袋')
    await user.clear(screen.getByLabelText('积分价格'))
    await user.type(screen.getByLabelText('积分价格'), '90')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(await screen.findByText('实物已创建')).toBeInTheDocument()
    expect(screen.getByText('帆布袋')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(screen.getByRole('heading', { name: '看乐积分兑换后台' })).toBeInTheDocument()
  })

  it('shows login validation and blocks non-admin users from the lite console', async () => {
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

  it('handles forced password change and cached-session parsing errors', async () => {
    localStorage.setItem('kanyue.points-lite.session', '{bad-json')
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'login').mockResolvedValueOnce({
      token: 'token',
      profile: { ...mockProfiles.admin, passwordChangeRequired: true },
    })
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByRole('heading', { name: '修改初始密码' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('当前密码'), 'old-secret')
    await user.type(screen.getByLabelText('新密码'), 'new-secret')
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(await screen.findByRole('heading', { name: '选择学员' })).toBeInTheDocument()
  })

  it('surfaces api failures from the initial student load path', async () => {
    const user = userEvent.setup()
    const api = createFailingApi()
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByText('students down')).toBeInTheDocument()
  })

  it('surfaces api failures from grant, redeem, and reward save paths', async () => {
    const user = userEvent.setup()
    const api = createFailingApi()
    api.listStudents = async () => mockStudents
    api.listRewards = async () => mockRewards
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByRole('heading', { name: '选择学员' })).toBeInTheDocument()

    api.addPoints = async () => { throw new Error('grant down') }
    await user.click(screen.getByRole('button', { name: '预览加分结果' }))
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('grant down')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回修改' }))

    api.offlineRedeem = async () => { throw new Error('redeem down') }
    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    await user.click(screen.getByRole('button', { name: '预览兑换结果' }))
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(await screen.findByText('redeem down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回修改' }))

    await user.click(screen.getByRole('button', { name: '实物管理' }))
    api.createReward = async () => { throw new Error('save down') }
    await user.click(screen.getByRole('button', { name: '新增实物' }))
    await user.type(screen.getByLabelText('实物名称'), '新奖品')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(await screen.findByText('save down')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '创建新的兑换实物' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭实物编辑器' }))

    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    api.uploadRewardImage = async () => { throw new Error('upload down') }
    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'failed.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: '替换图片' }))
    expect(await screen.findByText('upload down')).toBeInTheDocument()
  })
})

describe('points lite components', () => {
  it('searches students, switches selection, and renders locked/empty states', async () => {
    const user = userEvent.setup()
    const onSearchStudents = vi.fn()
    const onSelectStudent = vi.fn()
    render(
      <PointsWorkspace
        loading={false}
        rewards={mockRewards.items}
        selectedStudentId="student_2"
        studentSummary={summary(40)}
        students={mockStudents.items}
        onAddPoints={vi.fn()}
        onRedeem={vi.fn()}
        onSearchStudents={onSearchStudents}
        onSelectStudent={onSelectStudent}
      />,
    )

    await user.type(screen.getByLabelText('搜索学员'), '李')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(onSearchStudents).toHaveBeenCalledWith('李')
    await user.click(screen.getByRole('button', { name: /张同学/ }))
    expect(onSelectStudent).toHaveBeenCalledWith('student_1')
    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    expect(screen.getByText('乐理练习册')).toBeInTheDocument()
  })

  it('renders empty reward list and cancels reward editing', async () => {
    const user = userEvent.setup()
    render(<RewardItemsPanel loading={false} rewards={[]} onSave={vi.fn()} />)
    expect(screen.getByText('还没有实物')).toBeInTheDocument()

    const rewards: RewardItem[] = [{ ...mockRewards.items[0] }]
    render(<RewardItemsPanel loading={false} rewards={rewards} onSave={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
  })

  it('submits inactive reward edits and full create payloads', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    const rewards: RewardItem[] = [{ ...mockRewards.items[0] }]
    render(<RewardItemsPanel loading={false} rewards={rewards} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    await user.selectOptions(screen.getByLabelText('状态'), 'inactive')
    await user.click(screen.getByText('高级设置'))
    await user.clear(screen.getByLabelText('排序'))
    await user.type(screen.getByLabelText('排序'), '7')
    await user.clear(screen.getByLabelText('兼容图片 URL'))
    await user.type(screen.getByLabelText('兼容图片 URL'), 'https://example.com/a.png')
    await user.clear(screen.getByLabelText('说明'))
    await user.type(screen.getByLabelText('说明'), '前台领取')
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(onSave).toHaveBeenLastCalledWith('reward_sticker', expect.objectContaining({
      description: '前台领取',
      image: 'https://example.com/a.png',
      sortOrder: 7,
      status: 'inactive',
    }))

    await user.click(screen.getByRole('button', { name: '新增实物' }))
    await user.type(screen.getByLabelText('实物名称'), '徽章')
    await user.click(screen.getByRole('button', { name: '创建实物' }))
    expect(onSave).toHaveBeenLastCalledWith(null, expect.objectContaining({ name: '徽章', status: 'active' }))
  })

  it('validates, previews, and uploads a managed reward image', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const reward = { ...mockRewards.items[0] }
    const onUploadImage = vi.fn(async (_id: string, _file: File, onProgress?: (percent: number) => void) => {
      onProgress?.(45)
      return { ...reward, image: 'https://assets.example.test/reward.png' }
    })
    const { unmount } = render(<RewardItemsPanel loading={false} rewards={[reward]} onSave={vi.fn()} onUploadImage={onUploadImage} />)

    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    const input = screen.getByLabelText('选择图片')
    await user.upload(input, new File(['image'], 'reward.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: '替换图片' }))

    expect(onUploadImage).toHaveBeenCalledWith('reward_sticker', expect.objectContaining({ name: 'reward.png' }), expect.any(Function))
    expect(await screen.findByRole('progressbar', { name: '上传进度' })).toHaveValue(100)
    expect(screen.getByAltText('实物图片预览')).toHaveAttribute('src', 'https://assets.example.test/reward.png')
    fireEvent.error(screen.getByAltText('实物图片预览'))
    expect(screen.getByText('图片不可用')).toBeInTheDocument()

    await user.upload(screen.getByLabelText('选择图片'), new File(['text'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByText('仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片')).toBeInTheDocument()

    await user.upload(screen.getByLabelText('选择图片'), new File([], 'empty.png', { type: 'image/png' }))
    expect(screen.getByText('图片文件不能为空')).toBeInTheDocument()

    await user.upload(screen.getByLabelText('选择图片'), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
    expect(screen.getByText('图片不能超过 5MB')).toBeInTheDocument()

    unmount()
    const nullUpload = vi.fn(async () => null)
    render(<RewardItemsPanel loading={false} rewards={[reward]} onSave={vi.fn()} onUploadImage={nullUpload} />)
    await user.click(screen.getByRole('button', { name: '编辑贴纸套装' }))
    await user.upload(screen.getByLabelText('选择图片'), new File(['image'], 'retry.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: '替换图片' }))
    expect(nullUpload).toHaveBeenCalled()
  })

  it('covers empty learner and no-redeemable reward states', async () => {
    const onRedeem = vi.fn()
    const user = userEvent.setup()
    render(
      <PointsWorkspace
        loading={false}
        rewards={[]}
        selectedStudentId=""
        studentSummary={null}
        students={[]}
        onAddPoints={vi.fn()}
        onRedeem={onRedeem}
        onSearchStudents={vi.fn()}
        onSelectStudent={vi.fn()}
      />,
    )

    expect(screen.getByText('暂无匹配学员')).toBeInTheDocument()
    expect(screen.getByText('请选择学员')).toBeInTheDocument()
    expect(screen.getByText('选择后可增加积分或确认线下兑换')).toBeInTheDocument()
    expect(screen.getByText('暂无积分记录')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    expect(screen.getByText('所有上架实物当前均可兑换。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预览兑换结果' })).toBeDisabled()
    expect(onRedeem).not.toHaveBeenCalled()
  })

  it('submits add-points data and resets editable fields', async () => {
    const user = userEvent.setup()
    const onAddPoints = vi.fn().mockResolvedValue(undefined)
    render(
      <PointsWorkspace
        loading={false}
        rewards={mockRewards.items}
        selectedStudentId="student_1"
        studentSummary={summary(120)}
        students={mockStudents.items}
        onAddPoints={onAddPoints}
        onRedeem={vi.fn()}
        onSearchStudents={vi.fn()}
        onSelectStudent={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('积分数量'))
    await user.type(screen.getByLabelText('积分数量'), '15')
    await user.clear(screen.getByLabelText('原因'))
    await user.type(screen.getByLabelText('原因'), '主动练习')
    await user.type(screen.getByLabelText('备注'), '完成两首曲目')
    await user.click(screen.getByRole('button', { name: '预览加分结果' }))
    expect(onAddPoints).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '确认增加积分' })).toHaveTextContent('135')
    await user.click(screen.getByRole('button', { name: '返回修改' }))
    expect(screen.getByLabelText('积分数量')).toHaveValue(15)
    await user.click(screen.getByRole('button', { name: '预览加分结果' }))
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(onAddPoints).toHaveBeenCalledWith({ amount: 15, reason: '主动练习', remark: '完成两首曲目' })
    expect(screen.getByLabelText('积分数量')).toHaveValue(20)
    expect(screen.getByLabelText('备注')).toHaveValue('')
  })

  it('renders event fallback text and invalid dates', () => {
    render(
      <PointsWorkspace
        loading={false}
        rewards={mockRewards.items}
        selectedStudentId="student_1"
        studentSummary={{
          balance: 120,
          events: [
            { id: 'a', studentId: 'student_1', type: 'earn', delta: 1, balanceAfter: 1, reason: '', remark: '', created: undefined },
            { id: 'b', studentId: 'student_1', type: 'earn', delta: 1, balanceAfter: 2, reason: '', remark: '备注原因', created: 'not-a-date' },
          ],
          pagination: { page: 1, perPage: 20, totalItems: 2, totalPages: 1 },
          studentId: 'student_1',
        }}
        students={[{ ...mockStudents.items[0], realName: '', nickName: '', cellphone: '' }]}
        onAddPoints={vi.fn()}
        onRedeem={vi.fn()}
        onSearchStudents={vi.fn()}
        onSelectStudent={vi.fn()}
      />,
    )

    expect(screen.getByText('未填昵称 · 无手机号')).toBeInTheDocument()
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
    expect(screen.getAllByText('备注原因').length).toBeGreaterThan(0)
    expect(screen.getAllByText('not-a-date').length).toBeGreaterThan(0)
  })
})

function summary(balance: number): StudentPointSummary {
  return {
    balance,
    events: [],
    pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 },
    studentId: 'student_2',
  }
}

function createFailingApi(): OpsApi {
  return {
    login: async (): Promise<LoginResult> => ({ token: 'token', profile: mockProfiles.admin }),
    register: async () => ({ status: 'pending_activation', message: 'ok', profile: mockProfiles.teacher }),
    changePassword: async () => ({ token: 'token', profile: mockProfiles.admin }),
    listStudents: async () => { throw new Error('students down') },
    getStudentPoints: async () => summary(120),
    addPoints: async () => summary(120),
    offlineRedeem: async () => summary(120),
    listRewards: async () => mockRewards,
    createReward: async (_token, data) => ({ id: 'created', description: '', image: '', status: 'active', ...data }),
    updateReward: async (_token, id, data) => ({ id, description: '', image: '', status: 'active', ...data }),
    uploadRewardImage: async (_token, id) => ({ id, name: '图片实物', description: '', image: 'https://assets.test/image.png', pointsPrice: 10, status: 'active' }),
  }
}
