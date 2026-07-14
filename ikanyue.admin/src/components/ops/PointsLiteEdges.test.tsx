import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { mockRewards, mockStudents } from '../../app/mockData'
import type { RewardItem, StudentPointSummary } from '../../app/types'
import { PointsWorkspace } from './PointsWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'
import { RewardMedia } from './RewardMedia'

describe('points lite edge scenes', () => {
  it('changes the selected reward and keeps failed redemption review open', async () => {
    const user = userEvent.setup()
    const onRedeem = vi.fn().mockResolvedValue(false)
    render(<PointsWorkspace {...pointsProps({ onRedeem, studentSummary: summary(250), students: [{ ...mockStudents.items[0], balance: 250 }, mockStudents.items[1]] })} />)
    await user.click(screen.getAllByRole('button', { name: '为张同学线下兑换' })[0])
    await user.selectOptions(screen.getByLabelText('可兑换实物'), 'reward_book')
    await user.clear(screen.getByLabelText('兑换备注'))
    await user.type(screen.getByLabelText('兑换备注'), '前台已领取练习册')
    await user.click(screen.getByRole('button', { name: '复核兑换结果' }))
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toHaveTextContent('50')
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    expect(onRedeem).toHaveBeenCalledWith('student_1', 'reward_book', '前台已领取练习册')
    expect(screen.getByRole('dialog', { name: '确认线下兑换' })).toBeInTheDocument()
  })

  it('shows true and filtered empty states with reset and reload actions', async () => {
    const user = userEvent.setup()
    const onReloadStudents = vi.fn()
    const { rerender } = render(<PointsWorkspace {...pointsProps({ students: [], onReloadStudents })} />)
    expect(screen.getByText('还没有学员')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载学员' }))
    expect(onReloadStudents).toHaveBeenCalled()

    rerender(<PointsWorkspace {...pointsProps()} />)
    await user.type(screen.getByLabelText('搜索学员'), '不存在')
    expect(screen.getByText('没有匹配的学员')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(screen.getByRole('table')).toHaveTextContent('张同学')
  })

  it('shows detail retry after a failed summary load', async () => {
    const user = userEvent.setup()
    const onLoadStudent = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(summary(120))
    render(<PointsWorkspace {...pointsProps({ onLoadStudent })} />)
    await user.click(screen.getAllByRole('button', { name: '查看张同学详情' })[0])
    expect(await screen.findByText('学员详情加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('实物可兑换情况')).toBeInTheDocument()
    expect(onLoadStudent).toHaveBeenCalledTimes(2)
  })

  it('filters reward status and point range, then resets', async () => {
    const user = userEvent.setup()
    render(<RewardItemsPanel loading={false} onReloadRewards={vi.fn()} onSave={vi.fn()} rewards={mockRewards.items} />)
    await user.selectOptions(screen.getByLabelText('状态'), 'inactive')
    expect(screen.getByRole('table')).toHaveTextContent('下线奖品')
    expect(screen.getByRole('table')).not.toHaveTextContent('贴纸套装')
    await user.clear(screen.getByLabelText('最低积分'))
    await user.type(screen.getByLabelText('最低积分'), '20')
    expect(screen.getByText('没有匹配的实物')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(screen.getByRole('table')).toHaveTextContent('贴纸套装')
  })

  it('submits optional reward fields and validates image files', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const onSave = vi.fn().mockResolvedValue(true)
    const rewards: RewardItem[] = [{ id: 'fallback', name: '默认排序奖品', description: '', image: '', pointsPrice: 20, status: 'inactive' }]
    render(<RewardItemsPanel loading={false} onReloadRewards={vi.fn()} onSave={onSave} rewards={rewards} />)
    await user.click(screen.getAllByRole('button', { name: '编辑默认排序奖品' })[0])
    await user.click(screen.getByText('高级设置'))
    expect(screen.getAllByLabelText('排序').at(-1)).toHaveValue(0)
    expect(screen.getByLabelText('兼容图片 URL')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: '保存实物' }))
    expect(onSave).toHaveBeenCalledWith('fallback', expect.objectContaining({ sortOrder: 0, status: 'inactive' }))

    render(<RewardItemsPanel loading={false} onReloadRewards={vi.fn()} onSave={vi.fn()} onUploadImage={vi.fn()} rewards={[mockRewards.items[0]]} />)
    await user.click(screen.getAllByRole('button', { name: '编辑贴纸套装' }).at(-1)!)
    await user.upload(screen.getByLabelText('选择图片'), new File(['text'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByText('仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('选择图片'), new File([], 'empty.png', { type: 'image/png' }))
    expect(screen.getByText('图片文件不能为空')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('选择图片'), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
    expect(screen.getByText('图片不能超过 5MB')).toBeInTheDocument()
  })

  it('renders stable empty, loading, loaded, and failed reward media', async () => {
    const { rerender } = render(<RewardMedia name="" />)
    expect(screen.getByLabelText('暂无可用图片')).toHaveTextContent('礼')
    rerender(<RewardMedia alt="贴纸图片" name="贴纸" src="https://assets.test/sticker.png" />)
    expect(screen.getByLabelText('贴纸图片加载中')).toBeInTheDocument()
    fireEvent.load(screen.getByAltText('贴纸图片'))
    await waitFor(() => expect(screen.queryByLabelText('贴纸图片加载中')).not.toBeInTheDocument())
    fireEvent.error(screen.getByAltText('贴纸图片'))
    expect(screen.getByText('图片不可用')).toBeInTheDocument()
  })
})

function pointsProps(overrides: Partial<React.ComponentProps<typeof PointsWorkspace>> = {}): React.ComponentProps<typeof PointsWorkspace> { return { loading: false, rewards: mockRewards.items, selectedStudentId: 'student_1', studentSummary: summary(120), students: mockStudents.items, onAddPoints: vi.fn(), onLoadStudent: async () => summary(120), onRedeem: vi.fn(), onReloadStudents: vi.fn(), ...overrides } }
function summary(balance: number): StudentPointSummary { return { balance, events: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 }, studentId: 'student_1' } }
