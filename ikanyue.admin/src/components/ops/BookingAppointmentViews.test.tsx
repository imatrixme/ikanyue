import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BookingAppointment, BookingAppointmentDetail } from '../../app/bookingTypes'
import { BookingAppointmentDrawer, BookingAppointmentList, BookingCancelDialog, BookingConfirmDialog, BookingDeclineDialog, BookingRescheduleDialog, BookingStatusBadge } from './BookingAppointmentViews'

describe('booking appointment views', () => {
  it('renders list, mobile cards, calendar groups, pagination, and async states', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onModeChange = vi.fn()
    const onPageChange = vi.fn()
    const { rerender } = render(<BookingAppointmentList appointments={[{ ...appointment('pending'), location: '' }, appointment('confirmed', 'second')]} error="" loading={false} mode="list" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} page={1} totalItems={40} totalPages={2} />)
    expect(screen.getAllByText('一对一声乐课').length).toBeGreaterThan(1)
    await user.click(screen.getAllByRole('button', { name: '查看' })[0])
    await user.click(screen.getAllByRole('button', { name: '预约详情' })[0])
    await user.click(screen.getByRole('button', { name: '切换到日程' }))
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onModeChange).toHaveBeenCalledWith('calendar')
    expect(onPageChange).toHaveBeenCalledWith(2)

    rerender(<BookingAppointmentList appointments={[appointment('fulfilled'), appointment('cancelled', 'second')]} error="" loading={false} mode="calendar" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} page={2} totalItems={40} totalPages={2} />)
    expect(screen.getAllByText('2 个预约')).toHaveLength(1)
    await user.click(screen.getAllByRole('button', { name: /一对一声乐课/ })[0])
    await user.click(screen.getByRole('button', { name: '上一页' }))

    rerender(<BookingAppointmentList appointments={[]} error="" loading={false} mode="list" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} page={1} totalItems={0} totalPages={0} />)
    expect(screen.getByText('还没有预约记录')).toBeInTheDocument()
    rerender(<BookingAppointmentList appointments={[]} error="" filtered loading={false} mode="list" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} onReset={vi.fn()} page={1} totalItems={0} totalPages={0} />)
    expect(screen.getByText('没有匹配的预约记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置筛选' })).toBeInTheDocument()
    rerender(<BookingAppointmentList appointments={[]} error="" loading mode="list" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} page={1} totalItems={0} totalPages={0} />)
    expect(screen.getByLabelText('正在加载预约...')).toBeInTheDocument()
    rerender(<BookingAppointmentList appointments={[]} error="预约接口错误" loading={false} mode="list" onModeChange={onModeChange} onOpen={onOpen} onPageChange={onPageChange} page={1} totalItems={0} totalPages={0} />)
    expect(screen.getByText('预约接口错误')).toBeInTheDocument()
  })

  it('renders auditable detail actions and closed-state fallbacks', async () => {
    const user = userEvent.setup()
    const actions = { onCancel: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn(), onDecline: vi.fn(), onLesson: vi.fn(), onReschedule: vi.fn() }
    const { rerender } = render(<BookingAppointmentDrawer detail={detail('rescheduled')} loading={false} {...actions} />)
    const drawer = screen.getByRole('dialog', { name: '一对一声乐课预约' })
    expect(drawer).toHaveTextContent('处理记录')
    expect(drawer).toHaveTextContent('教师时间')
    expect(drawer).toHaveTextContent('已释放')
    await user.click(within(drawer).getByRole('button', { name: '关联课堂' }))
    await user.click(within(drawer).getByRole('button', { name: '调整时间' }))
    await user.click(within(drawer).getByRole('button', { name: '取消预约' }))
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    expect(actions.onLesson).toHaveBeenCalledWith('lesson_1')
    expect(actions.onReschedule).toHaveBeenCalled()
    expect(actions.onCancel).toHaveBeenCalled()
    expect(actions.onClose).toHaveBeenCalled()

    rerender(<BookingAppointmentDrawer detail={{ ...detail('fulfilled'), lessonId: '', location: '', events: [], claims: [] }} loading={false} {...actions} />)
    expect(screen.getByText('暂无处理记录。')).toBeInTheDocument()
    expect(screen.getByText('待确认预约不会占用时间。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消预约' })).not.toBeInTheDocument()

    rerender(<BookingAppointmentDrawer detail={{ ...detail('pending'), lessonId: '' }} loading={false} {...actions} />)
    await user.click(screen.getByRole('button', { name: '代教师确认' }))
    await user.click(screen.getByRole('button', { name: '拒绝预约' }))
    expect(actions.onConfirm).toHaveBeenCalled()
    expect(actions.onDecline).toHaveBeenCalled()
  })

  it('requires explicit confirmation and a decline reason', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const confirmView = render(<BookingConfirmDialog loading={false} onClose={onClose} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: '确认预约' }))
    expect(onConfirm).toHaveBeenCalled()
    confirmView.unmount()

    const onDecline = vi.fn().mockResolvedValue(undefined)
    render(<BookingDeclineDialog loading={false} onClose={onClose} onConfirm={onDecline} />)
    const dialog = screen.getByRole('dialog', { name: '拒绝预约' })
    expect(within(dialog).getByRole('button', { name: '确认拒绝' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('拒绝原因'), '教师时间冲突')
    await user.click(within(dialog).getByRole('button', { name: '确认拒绝' }))
    expect(onDecline).toHaveBeenCalledWith('教师时间冲突')
  })

  it('submits cancellation and reschedule dialogs only with valid inputs', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const view = render(<BookingCancelDialog loading={false} onClose={onClose} onConfirm={onCancel} />)
    const cancelDialog = screen.getByRole('dialog', { name: '取消预约' })
    await user.clear(within(cancelDialog).getByLabelText('取消原因'))
    expect(within(cancelDialog).getByRole('button', { name: '确认取消' })).toBeDisabled()
    await user.type(within(cancelDialog).getByLabelText('取消原因'), '课程调整')
    await user.click(within(cancelDialog).getByRole('button', { name: '确认取消' }))
    expect(onCancel).toHaveBeenCalledWith('课程调整')
    await user.click(within(cancelDialog).getByRole('button', { name: '返回' }))
    expect(onClose).toHaveBeenCalled()
    view.unmount()

    const onReschedule = vi.fn().mockResolvedValue(undefined)
    render(<BookingRescheduleDialog appointment={detail('confirmed')} loading={false} onClose={onClose} onConfirm={onReschedule} />)
    const dialog = screen.getByRole('dialog', { name: '调整预约时间' })
    const start = within(dialog).getByLabelText('新开始时间')
    const end = within(dialog).getByLabelText('新结束时间')
    await user.clear(end)
    await user.type(end, '2026-08-02T08:00')
    expect(within(dialog).getByRole('button', { name: '确认调整' })).toBeDisabled()
    await user.clear(start)
    await user.type(start, '2026-08-03T09:00')
    await user.clear(end)
    await user.type(end, '2026-08-03T10:00')
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(onReschedule).toHaveBeenCalledWith(expect.stringContaining('2026-08-03'), expect.stringContaining('2026-08-03'), '教务调整课程时间')
  })

  it('covers every status label and tone fallback', () => {
    render(<div>{['pending', 'confirmed', 'fulfilled', 'rescheduled', 'declined', 'cancelled', 'slot_taken', 'eligibility_lost', 'withdrawn', 'expired', 'unknown'].map((status) => <BookingStatusBadge key={status} status={status} />)}</div>)
    expect(screen.getByText('待确认')).toBeInTheDocument()
    expect(screen.getByText('时段已被占用')).toBeInTheDocument()
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })
})

function appointment(status: BookingAppointment['status'], id = 'first'): BookingAppointment {
  return { appointmentId: id, status, course: { courseId: 'course_1', name: '一对一声乐课' }, teacher: { teacherId: 'teacher_1', name: '林老师' }, student: { studentId: 'student_1', name: '张同学' }, startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-03T02:00:00.000Z', location: '二号琴房', note: '', responseReason: '', responseDeadline: '2026-08-02T01:00:00.000Z', lessonId: status === 'confirmed' ? 'lesson_1' : '', canCancel: status === 'confirmed', canConfirm: status === 'pending', canDecline: status === 'pending', version: 1 }
}

function detail(status: BookingAppointment['status']): BookingAppointmentDetail {
  return { ...appointment(status), lessonId: 'lesson_1', note: '希望练习气息', responseReason: '已协调', events: [{ id: 'event_1', eventType: 'requested', toStatus: 'pending', actorRole: 'student', created: '2026-08-01T00:00:00.000Z' }, { id: 'event_2', eventType: 'rescheduled', fromStatus: 'confirmed', toStatus: status, actorRole: 'admin', reason: '调整', created: 'invalid' }, { id: 'event_3', eventType: 'custom', toStatus: 'unknown', actorRole: 'custom' }], claims: [{ id: 'claim_1', ownerType: 'teacher', ownerId: 'teacher_1', cellStartAt: '2026-08-03T01:00:00.000Z', cellEndAt: '2026-08-03T01:15:00.000Z', status: 'active' }, { id: 'claim_2', ownerType: 'student', ownerId: 'student_1', cellStartAt: '2026-08-03T01:00:00.000Z', cellEndAt: '2026-08-03T01:15:00.000Z', status: 'released' }, { id: 'claim_3', ownerType: 'room', ownerId: 'room_1', cellStartAt: '2026-08-03T01:00:00.000Z', cellEndAt: '2026-08-03T01:15:00.000Z', status: 'active' }] }
}
