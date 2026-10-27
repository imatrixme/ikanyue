import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { BookingConflictViews } from './BookingConflictViews'

describe('booking conflict and migration workspace', () => {
  it('previews unsafe backfill, applies with confirmation, and resolves conflicts', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    const apply = vi.spyOn(api, 'applyBookingBackfill')
    const resolve = vi.spyOn(api, 'resolveBookingConflict')
    render(<BookingConflictViews api={api} referenceData={refs} token="token" />)
    expect((await screen.findAllByText('教师时间重叠')).length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('结束日（可选）'), '2030-09-01')
    await user.click(screen.getByRole('button', { name: '预检历史课堂' }))
    expect(await screen.findByText('回填预检发现冲突')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '进入执行确认' }))
    let dialog = screen.getByRole('dialog', { name: '确认回填未来课堂' })
    expect(dialog).toHaveTextContent('保持相关教师预约配置停用')
    await user.click(within(dialog).getByRole('button', { name: '执行回填' }))
    expect(apply).toHaveBeenCalled()
    expect(await screen.findByText(/已扫描 4 节未来课堂/)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '记录处理结果' })[0])
    dialog = screen.getByRole('dialog', { name: '记录冲突处理结果' })
    await user.click(within(dialog).getByRole('button', { name: '确认关闭冲突' }))
    expect(resolve).toHaveBeenCalledWith('token', 'conflict_1', '已核对排课并完成线下调整')
    expect(await screen.findByText('还没有待处理冲突')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '已处理' }))
    expect(await screen.findByText('已核对排课并完成线下调整')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预检历史课堂' }))
    expect(await screen.findByText('回填预检可以执行')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '进入执行确认' }))
    dialog = screen.getByRole('dialog', { name: '确认回填未来课堂' })
    expect(dialog).toHaveTextContent('建立时间占用')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
  })

  it('renders empty queues, paging controls, date edits, and load/command errors', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'listBookingConflicts').mockResolvedValue({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 })
    const view = render(<BookingConflictViews api={api} referenceData={refs} token="token" />)
    expect(await screen.findByText('还没有待处理冲突')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '已处理' }))
    expect(await screen.findByText('还没有已处理冲突')).toBeInTheDocument()
    await user.type(screen.getByLabelText('结束日（可选）'), '2030-09-01')
    await user.click(screen.getByRole('button', { name: '刷新冲突队列' }))
    view.unmount()

    const errorApi = createMockOpsApi()
    vi.spyOn(errorApi, 'listBookingConflicts').mockRejectedValueOnce(new Error('冲突接口失败'))
    render(<BookingConflictViews api={errorApi} referenceData={refs} token="token" />)
    expect(await screen.findAllByText('冲突接口失败')).not.toHaveLength(0)
  })

  it('keeps dialogs open when conflict and backfill commands fail', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'resolveBookingConflict').mockRejectedValueOnce('offline')
    vi.spyOn(api, 'previewBookingBackfill').mockRejectedValueOnce('offline')
    render(<BookingConflictViews api={api} referenceData={refs} token="token" />)
    expect((await screen.findAllByText('教师时间重叠')).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: '记录处理结果' })[0])
    const dialog = screen.getByRole('dialog', { name: '记录冲突处理结果' })
    await user.click(within(dialog).getByRole('button', { name: '确认关闭冲突' }))
    expect((await screen.findAllByText('关闭冲突失败')).length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getByRole('button', { name: '预检历史课堂' }))
    expect(await screen.findAllByText('回填预检失败')).not.toHaveLength(0)
  })

  it('keeps resolved and incomplete conflict references understandable', async () => {
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'listBookingConflicts').mockResolvedValue({
      items: [
        { id: 'resolved-empty', type: 'external_conflict', status: 'resolved', startAt: 'invalid-date', endAt: 'invalid-date', resolution: '' },
        { id: 'resolved-appointment', type: 'student_overlap', status: 'ignored', teacherId: 'missing-teacher', studentId: 'missing-student', appointmentId: 'appointment-1', startAt: '2030-09-01T09:00:00.000Z', endAt: '2030-09-01T10:00:00.000Z', details: { reason: '已在线下调整' }, resolution: '已转交其他教师' },
      ],
      page: 1,
      perPage: 20,
      totalItems: 2,
      totalPages: 1,
    })
    render(<BookingConflictViews api={api} referenceData={{ ...refs, teachers: [] }} token="token" />)

    expect((await screen.findAllByText('external_conflict')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('无关联安排').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已关闭').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已在线下调整').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/未找到人员/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '记录处理结果' })).not.toBeInTheDocument()
  })

  it('handles appointment-only conflicts and ignores incomplete resolution text', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    const resolve = vi.spyOn(api, 'resolveBookingConflict')
    vi.spyOn(api, 'listBookingConflicts').mockResolvedValue({
      items: [{
        id: 'appointment-conflict', type: 'student_overlap', status: 'open', teacherId: 'teacher_1', studentId: 'student_1', appointmentId: 'appointment-1',
        startAt: '2030-09-01T09:00:00.000Z', endAt: '2030-09-01T10:00:00.000Z',
      }],
      page: 1,
      perPage: 20,
      totalItems: 1,
      totalPages: 1,
    })
    render(<BookingConflictViews api={api} referenceData={refs} token="token" />)

    expect((await screen.findAllByText('学员时间重叠')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '预检历史课堂' }))
    await user.click(await screen.findByRole('button', { name: '进入执行确认' }))
    await user.click(within(screen.getByRole('dialog', { name: '确认回填未来课堂' })).getByRole('button', { name: '执行回填' }))

    await user.click(screen.getAllByRole('button', { name: '记录处理结果' })[0])
    const dialog = screen.getByRole('dialog', { name: '记录冲突处理结果' })
    expect(dialog).toHaveTextContent('课程预约')
    expect(dialog).toHaveTextContent('张同学')
    await user.clear(within(dialog).getByLabelText('处理结果'))
    await user.type(within(dialog).getByLabelText('处理结果'), '已调')
    fireEvent.submit(dialog.querySelector('form')!)
    expect(resolve).not.toHaveBeenCalled()
  })
})
