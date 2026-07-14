import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PointEvent, RewardItem, StudentPointSummary, StudentPointsRow } from '../../app/types'
import { DialogShell } from '../ui/DialogShell'
import { FilterSummary, ListEmptyState, PaginationControls } from './ListControls'
import { PointEventsView } from './PointEventsPanel'
import { PointsWorkspace } from './PointsWorkspace'
import { RewardItemsPanel } from './RewardItemsPanel'
import { isRecord, stringValue } from './listState'

const rewards: RewardItem[] = [
  { id: 'low', name: '徽章', description: '课堂纪念', image: '', pointsPrice: 20, sortOrder: 2, status: 'active' },
  { id: 'high', name: '画册', description: '年度作品', image: '', pointsPrice: 100, sortOrder: 1, status: 'active' },
  { id: 'off', name: '旧礼物', description: '', image: '', pointsPrice: 5, status: 'inactive' },
]

const students: StudentPointsRow[] = [
  { id: 'real', realName: '周同学', nickName: '阿周', cellphone: '13900000001', balance: 60 },
  { id: 'nick', realName: '', nickName: '小北', cellphone: '', balance: 10 },
  { id: 'phone', realName: '', nickName: '', cellphone: '13900000003', balance: 120 },
  { id: 'none', realName: '', nickName: '', cellphone: '', balance: 0 },
]

describe('admin workflow state matrix', () => {
  it('covers learner range filters, all sort modes, loading, and identity fallbacks', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PointsWorkspace {...workspaceProps()} />)

    expect(screen.getByRole('table')).toHaveTextContent('小北')
    expect(screen.getByRole('table')).toHaveTextContent('13900000003')
    expect(screen.getByRole('table')).toHaveTextContent('未命名学员')
    expect(screen.getByRole('table')).toHaveTextContent('无手机号')

    await user.selectOptions(screen.getByLabelText('排序'), 'balance-desc')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('13900000003')
    await user.selectOptions(screen.getByLabelText('排序'), 'balance-asc')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('未命名学员')

    await user.type(screen.getByLabelText('最低积分'), '10')
    await user.type(screen.getByLabelText('最高积分'), '60')
    expect(screen.getByRole('table')).toHaveTextContent('周同学')
    expect(screen.getByRole('table')).not.toHaveTextContent('13900000003')
    await user.clear(screen.getByLabelText('最低积分'))
    await user.clear(screen.getByLabelText('最高积分'))
    await user.type(screen.getByLabelText('搜索学员'), '阿周')
    expect(screen.getByRole('table')).toHaveTextContent('周同学')
    await user.clear(screen.getByLabelText('搜索学员'))
    await user.type(screen.getByLabelText('搜索学员'), '00003')
    expect(screen.getByRole('table')).toHaveTextContent('13900000003')

    rerender(<PointsWorkspace {...workspaceProps({ loading: true, students: [] })} />)
    expect(screen.getByText('正在加载学员积分...')).toBeInTheDocument()
  })

  it('handles unavailable redemption, invalid grant input, and successful undefined callbacks', async () => {
    const user = userEvent.setup()
    const onAddPoints = vi.fn().mockResolvedValue(undefined)
    const onRedeem = vi.fn().mockResolvedValue(undefined)
    render(<PointsWorkspace {...workspaceProps({ onAddPoints, onRedeem, students: [{ ...students[3], balance: 10 }] })} />)

    await user.click(screen.getAllByRole('button', { name: '为未命名学员线下兑换' })[0])
    expect(screen.getByText('当前积分还不能兑换任何上架实物。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复核兑换结果' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    await user.click(screen.getAllByRole('button', { name: '为未命名学员增加积分' })[0])
    await user.clear(screen.getByLabelText('积分数量'))
    expect(screen.getByRole('button', { name: '复核加分结果' })).toBeDisabled()
    await user.type(screen.getByLabelText('积分数量'), '5')
    await user.clear(screen.getByLabelText('原因'))
    await user.click(screen.getByRole('button', { name: '复核加分结果' }))
    expect(screen.getByText('未填写原因 · 增加 5 分')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认执行' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onAddPoints).toHaveBeenCalled()
    expect(onRedeem).not.toHaveBeenCalled()
  })

  it('sanitizes learner preferences and shows anonymous detail without active rewards', async () => {
    localStorage.setItem('kanyue.points.filters.v1', JSON.stringify({ keyword: 3, minBalance: null, maxBalance: {}, sort: 'unknown' }))
    const user = userEvent.setup()
    const anonymous = students[3]
    const noActiveRewards = [rewards[2]]
    const loadedSummary = summary(0)
    const view = render(<PointsWorkspace {...workspaceProps({ rewards: noActiveRewards, selectedStudentId: anonymous.id, studentSummary: loadedSummary, students: [anonymous], onLoadStudent: vi.fn().mockResolvedValue(loadedSummary) })} />)

    expect(screen.getByLabelText('排序')).toHaveValue('name-asc')
    await user.click(screen.getAllByRole('button', { name: '查看未命名学员详情' })[0])
    expect(await screen.findByRole('dialog', { name: '未命名学员积分详情' })).toHaveTextContent('无手机号')
    expect(screen.getByText('暂无上架实物。')).toBeInTheDocument()
    expect(screen.getByText('暂无积分记录')).toBeInTheDocument()

    view.unmount()
    localStorage.setItem('kanyue.points.filters.v1', '[]')
    render(<PointsWorkspace {...workspaceProps({ students: [anonymous] })} />)
    expect(screen.getByLabelText('排序')).toHaveValue('name-asc')
  })

  it('renders every point-event label, reason fallback, delta, and date state', () => {
    const events: PointEvent[] = [
      { id: 'redeem', studentId: 'real', type: 'offline_redeem', delta: -20, balanceAfter: 40, reason: '', rewardSnapshot: { id: 'low', name: '徽章', pointsPrice: 20 }, created: '2026-07-11T08:00:00.000Z' },
      { id: 'reason', studentId: 'real', type: 'earn', delta: 10, balanceAfter: 50, reason: '课堂奖励', created: 'invalid-date' },
      { id: 'remark', studentId: 'real', type: 'earn', delta: 5, balanceAfter: 55, reason: '', remark: '补记', created: undefined },
      { id: 'empty', studentId: 'real', type: 'earn', delta: 0, balanceAfter: 55, reason: '' },
    ]
    const { rerender } = render(<PointEventsView events={events} />)
    expect(screen.getAllByText('线下兑换').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-20').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('徽章').length).toBeGreaterThan(0)
    expect(screen.getAllByText('补记').length).toBeGreaterThan(0)
    expect(screen.getAllByText('invalid-date').length).toBeGreaterThan(0)
    rerender(<PointEventsView events={[]} />)
    expect(screen.getByText('暂无积分记录')).toBeInTheDocument()
  })

  it('covers reward search, ranges, sort modes, clean close, loading, and true empty creation', async () => {
    localStorage.setItem('kanyue.rewards.filters.v1', JSON.stringify({ keyword: 3, minPoints: null, maxPoints: {}, status: 'bad', sort: 'bad' }))
    const user = userEvent.setup()
    const onReloadRewards = vi.fn()
    const { rerender } = render(<RewardItemsPanel loading={false} onReloadRewards={onReloadRewards} onSave={vi.fn().mockResolvedValue(false)} rewards={rewards} />)

    await user.selectOptions(screen.getByLabelText('排序'), 'price-desc')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('画册')
    await user.selectOptions(screen.getByLabelText('排序'), 'price-asc')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('旧礼物')
    await user.selectOptions(screen.getByLabelText('排序'), 'name-asc')
    expect(screen.getByLabelText('排序')).toHaveValue('name-asc')
    await user.type(screen.getByLabelText('最低积分'), '10')
    await user.type(screen.getByLabelText('最高积分'), '30')
    expect(screen.getByRole('table')).toHaveTextContent('徽章')
    expect(screen.getByRole('table')).not.toHaveTextContent('画册')
    await user.click(screen.getByRole('button', { name: '重置' }))
    await user.type(screen.getByLabelText('搜索实物'), '年度')
    expect(screen.getByRole('table')).toHaveTextContent('画册')
    await user.click(screen.getByRole('button', { name: '重新加载实物' }))
    expect(onReloadRewards).toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: '编辑画册' })[0])
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置' }))

    rerender(<RewardItemsPanel loading onReloadRewards={onReloadRewards} onSave={vi.fn()} rewards={[]} />)
    expect(screen.getByText('正在加载实物...')).toBeInTheDocument()
    rerender(<RewardItemsPanel loading={false} onReloadRewards={onReloadRewards} onSave={vi.fn()} rewards={[]} />)
    await user.click(screen.getAllByRole('button', { name: '新增实物' }).at(-1)!)
    expect(screen.getByRole('dialog', { name: '新增实物' })).toHaveTextContent('先创建实物，再上传和管理图片。')
  })

  it('covers shared list controls and dialog focus/close edge states', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    const onCreate = vi.fn()
    const onPageChange = vi.fn()
    const { rerender } = render(<><FilterSummary activeCount={0} onReset={onReset} /><PaginationControls page={1} totalItems={0} totalPages={1} onPageChange={onPageChange} /><ListEmptyState filtered={false} noun="实物" onCreate={onCreate} /></>)
    await user.click(screen.getByRole('button', { name: '新增实物' }))
    expect(onCreate).toHaveBeenCalled()
    rerender(<><FilterSummary activeCount={2} onReset={onReset} /><PaginationControls page={2} totalItems={9} totalPages={3} onPageChange={onPageChange} /><ListEmptyState filtered noun="实物" onReset={onReset} /></>)
    await user.click(screen.getByRole('button', { name: '上一页' }))
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3)

    rerender(<DialogWithoutFocusable />)
    await user.tab()
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(stringValue(12, 'fallback')).toBe('fallback')
  })
})

function workspaceProps(overrides: Partial<React.ComponentProps<typeof PointsWorkspace>> = {}): React.ComponentProps<typeof PointsWorkspace> {
  return {
    loading: false,
    rewards,
    selectedStudentId: 'real',
    studentSummary: summary(60),
    students,
    onAddPoints: vi.fn(),
    onLoadStudent: async () => summary(60),
    onRedeem: vi.fn(),
    onReloadStudents: vi.fn(),
    ...overrides,
  }
}

function summary(balance: number): StudentPointSummary {
  return { balance, events: [], pagination: { page: 1, perPage: 20, totalItems: 0, totalPages: 1 }, studentId: 'real' }
}

function DialogWithoutFocusable() {
  const [open] = useState(true)
  return open ? <DialogShell dismissible={false} onRequestClose={vi.fn()} title="无按钮弹窗"><p>纯文本内容</p></DialogShell> : null
}
