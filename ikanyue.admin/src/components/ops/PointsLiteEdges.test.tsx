import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { createMockOpsApi } from '../../app/api'
import { mockProfiles, mockRewards, mockStudents } from '../../app/mockData'
import type { RewardItem, StudentPointSummary } from '../../app/types'
import { PointsWorkspace } from './PointsWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'
import { RewardMedia } from './RewardMedia'

describe('points lite app edge flows', () => {
  it('switches selected students and reports forced password change errors in App', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'login').mockResolvedValueOnce({
      token: 'token',
      profile: { ...mockProfiles.admin, passwordChangeRequired: true },
    })
    vi.spyOn(api, 'changePassword').mockRejectedValueOnce(new Error('change failed'))
    render(<App api={api} />)

    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByRole('heading', { name: '修改初始密码' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('当前密码'), 'old')
    await user.type(screen.getByLabelText('新密码'), 'new')
    await user.type(screen.getByLabelText('确认新密码'), 'new')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(await screen.findByText('change failed')).toBeInTheDocument()
  })

  it('changes the redeem item and remark before submitting', async () => {
    const user = userEvent.setup()
    const onRedeem = vi.fn().mockResolvedValue(undefined)
    render(
      <PointsWorkspace
        loading={false}
        rewards={mockRewards.items}
        selectedStudentId="student_1"
        studentSummary={summary(250)}
        students={mockStudents.items}
        onAddPoints={vi.fn()}
        onRedeem={onRedeem}
        onSearchStudents={vi.fn()}
        onSelectStudent={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    await user.selectOptions(screen.getByLabelText('可兑换实物'), 'reward_book')
    await user.clear(screen.getByLabelText('兑换备注'))
    await user.type(screen.getByLabelText('兑换备注'), '前台已领取练习册')
    await user.click(screen.getByRole('button', { name: '预览兑换结果' }))
    expect(onRedeem).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toHaveTextContent('250')
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toHaveTextContent('50')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(onRedeem).toHaveBeenCalledWith('reward_book', '前台已领取练习册')
  })

  it('ignores redeem submit when no item can be selected', async () => {
    const user = userEvent.setup()
    const onRedeem = vi.fn()
    render(
      <PointsWorkspace
        loading={false}
        rewards={[]}
        selectedStudentId=""
        studentSummary={summary(0)}
        students={[]}
        onAddPoints={vi.fn()}
        onRedeem={onRedeem}
        onSearchStudents={vi.fn()}
        onSelectStudent={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('tab', { name: '线下兑换' }))
    screen.getByRole('button', { name: '预览兑换结果' }).removeAttribute('disabled')
    await user.click(screen.getByRole('button', { name: '预览兑换结果' }))
    expect(onRedeem).not.toHaveBeenCalled()
  })

  it('edits rewards with missing optional fields and sort fallbacks', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    const rewards: RewardItem[] = [
      { id: 'late', name: '后置奖品', description: '', image: '', pointsPrice: 80, sortOrder: 5, status: 'active' },
      { id: 'fallback', name: '默认排序奖品', description: '', image: '', pointsPrice: 20, status: 'inactive' },
    ]
    render(<RewardItemsPanel loading={false} rewards={rewards} onSave={onSave} />)

    expect(screen.getAllByRole('button', { name: /编辑/ })[0]).toHaveAccessibleName('编辑默认排序奖品')
    await user.click(screen.getByRole('button', { name: '编辑默认排序奖品' }))
    expect(screen.getByLabelText('说明')).toHaveValue('')
    await user.click(screen.getByText('高级设置'))
    expect(screen.getByLabelText('兼容图片 URL')).toHaveValue('')
    expect(screen.getByLabelText('排序')).toHaveValue(0)
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(onSave).toHaveBeenCalledWith('fallback', expect.objectContaining({
      description: '',
      image: '',
      sortOrder: 0,
      status: 'inactive',
    }))
  })

  it('renders stable empty, loading, and loaded reward media states', () => {
    const { rerender } = render(<RewardMedia name="" />)
    expect(screen.getByLabelText('暂无可用图片')).toHaveTextContent('礼')

    rerender(<RewardMedia alt="贴纸图片" name="贴纸" src="https://assets.test/sticker.png" />)
    expect(screen.getByLabelText('贴纸图片加载中')).toBeInTheDocument()
    fireEvent.load(screen.getByAltText('贴纸图片'))
    expect(screen.queryByLabelText('贴纸图片加载中')).not.toBeInTheDocument()
    expect(screen.getByAltText('贴纸图片')).toBeInTheDocument()
  })
})

function summary(balance: number): StudentPointSummary {
  return {
    balance,
    events: [],
    pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 },
    studentId: 'student_1',
  }
}
