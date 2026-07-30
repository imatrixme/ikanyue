import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { BookingWorkspace } from './BookingWorkspace'

describe('booking workspace', () => {
  it('keeps filters and display mode URL-stable and opens appointment detail', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    renderWorkspace(api)
    expect(await screen.findByRole('heading', { name: '课程预约' })).toBeInTheDocument()
    expect(await screen.findByText('张同学')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('预约状态'), 'pending')
    expect(screen.getByTestId('location')).toHaveTextContent('status=pending')
    await user.selectOptions(screen.getByLabelText('教师'), 'teacher_1')
    await user.selectOptions(screen.getByLabelText('课程'), 'course_1')
    await user.type(screen.getByLabelText('开始日期'), '2026-08-01')
    await user.type(screen.getByLabelText('结束日期'), '2026-08-31')
    await user.click(screen.getByRole('button', { name: '切换到日程' }))
    expect(screen.getByTestId('location')).toHaveTextContent('mode=calendar')
    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('teacherId=')
    await user.click(screen.getByRole('button', { name: '切换到列表' }))

    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    const drawer = await screen.findByRole('dialog', { name: '一对一声乐课预约' })
    expect(drawer).toHaveTextContent('张同学')
    expect(within(drawer).queryByRole('button', { name: '取消预约' })).not.toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '代教师确认' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '拒绝预约' })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
  })

  it('preserves rapid query updates before the router rerenders', async () => {
    renderWorkspace(createMockOpsApi(), '/appointments?mode=calendar')
    await screen.findByLabelText('预约状态')

    fireEvent.click(screen.getByRole('button', { name: '切换到列表' }))
    fireEvent.change(screen.getByLabelText('预约状态'), { target: { value: 'confirmed,rescheduled' } })

    expect(screen.getByTestId('location')).toHaveTextContent('mode=list')
    expect(screen.getByTestId('location')).toHaveTextContent('status=confirmed%2Crescheduled')
  })

  it('reschedules, cancels, and follows linked lessons without stacking overlays', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const reschedule = vi.spyOn(api, 'rescheduleBookingAppointment')
    const cancel = vi.spyOn(api, 'cancelBookingAppointment')
    const firstView = renderWorkspace(api, '/appointments?status=confirmed')
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    let drawer = await screen.findByRole('dialog', { name: '一对一声乐课预约' })
    await user.click(within(drawer).getByRole('button', { name: '关联课堂' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/lessons?sessionId=lesson_2')
    firstView.unmount()

    renderWorkspace(api, '/appointments?status=confirmed')
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    drawer = await screen.findByRole('dialog', { name: '一对一声乐课预约' })
    await user.click(within(drawer).getByRole('button', { name: '调整时间' }))
    expect(screen.queryByRole('dialog', { name: '一对一声乐课预约' })).not.toBeInTheDocument()
    let dialog = screen.getByRole('dialog', { name: '调整预约时间' })
    await user.clear(within(dialog).getByLabelText('新开始时间'))
    await user.type(within(dialog).getByLabelText('新开始时间'), '2026-08-08T09:00')
    await user.clear(within(dialog).getByLabelText('新结束时间'))
    await user.type(within(dialog).getByLabelText('新结束时间'), '2026-08-08T10:00')
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(reschedule).toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('预约状态'), 'confirmed,rescheduled')
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    drawer = await screen.findByRole('dialog', { name: '一对一声乐课预约' })
    await user.click(within(drawer).getByRole('button', { name: '取消预约' }))
    dialog = screen.getByRole('dialog', { name: '取消预约' })
    await user.click(within(dialog).getByRole('button', { name: '确认取消' }))
    expect(cancel).toHaveBeenCalled()
  })

  it('lets Admin confirm or decline pending appointments', async () => {
    const user = userEvent.setup()
    const confirmApi = createMockOpsApi()
    const confirm = vi.spyOn(confirmApi, 'confirmBookingAppointment')
    const confirmView = renderWorkspace(confirmApi, '/appointments?status=pending')
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    await user.click(within(screen.getByRole('dialog', { name: '一对一声乐课预约' })).getByRole('button', { name: '代教师确认' }))
    await user.click(within(screen.getByRole('dialog', { name: '代教师确认预约' })).getByRole('button', { name: '确认预约' }))
    expect(confirm).toHaveBeenCalledWith('token', 'appointment_1')
    confirmView.unmount()

    const declineApi = createMockOpsApi()
    const decline = vi.spyOn(declineApi, 'declineBookingAppointment')
    renderWorkspace(declineApi, '/appointments?status=pending')
    await user.click((await screen.findAllByRole('button', { name: '查看' }))[0])
    await user.click(within(screen.getByRole('dialog', { name: '一对一声乐课预约' })).getByRole('button', { name: '拒绝预约' }))
    const dialog = screen.getByRole('dialog', { name: '拒绝预约' })
    await user.type(within(dialog).getByLabelText('拒绝原因'), '教师当天无法授课')
    await user.click(within(dialog).getByRole('button', { name: '确认拒绝' }))
    expect(decline).toHaveBeenCalledWith('token', 'appointment_1', '教师当天无法授课')
  })

  it('switches to configuration and conflict tabs using query state', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    renderWorkspace(api, '/appointments?tab=configuration')
    expect(await screen.findByRole('heading', { name: '教师可预约课程' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('tab=configuration')
    await user.click(screen.getByRole('tab', { name: '冲突与迁移' }))
    expect(await screen.findByRole('heading', { name: '冲突处理队列' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('tab=conflicts')
    await user.click(screen.getByRole('tab', { name: '预约队列' }))
    expect(await screen.findByLabelText('预约状态')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '刷新预约工作区' }))
  })

  it('shows summary, list, detail, and command failures with stable fallbacks', async () => {
    const listApi = createMockOpsApi()
    vi.spyOn(listApi, 'listBookingAppointments').mockRejectedValueOnce(new Error('预约列表失败'))
    const view = renderWorkspace(listApi)
    expect(await screen.findByText('预约列表失败')).toBeInTheDocument()
    view.unmount()

    const summaryApi = createMockOpsApi()
    vi.spyOn(summaryApi, 'getBookingDashboard').mockRejectedValueOnce('offline')
    const summaryView = renderWorkspace(summaryApi, '/appointments?tab=configuration')
    expect(await screen.findByText('加载预约概览失败')).toBeInTheDocument()
    summaryView.unmount()

    const detailApi = createMockOpsApi()
    vi.spyOn(detailApi, 'getBookingAppointment').mockRejectedValueOnce('offline')
    const detailView = renderWorkspace(detailApi)
    await userEvent.setup().click((await screen.findAllByRole('button', { name: '查看' }))[0])
    expect(await screen.findByText('加载预约详情失败')).toBeInTheDocument()
    detailView.unmount()

    const commandApi = createMockOpsApi()
    vi.spyOn(commandApi, 'cancelBookingAppointment').mockRejectedValueOnce(new Error('取消失败'))
    renderWorkspace(commandApi, '/appointments?status=confirmed')
    await userEvent.setup().click((await screen.findAllByRole('button', { name: '查看' }))[0])
    const drawer = await screen.findByRole('dialog', { name: '一对一声乐课预约' })
    await userEvent.setup().click(within(drawer).getByRole('button', { name: '取消预约' }))
    const dialog = screen.getByRole('dialog', { name: '取消预约' })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '确认取消' }))
    expect(await screen.findByText('取消失败')).toBeInTheDocument()
  })
})

function renderWorkspace(api = createMockOpsApi(), initialEntry = '/appointments') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><BookingWorkspace api={api} token="token" /><Location /></MemoryRouter>)
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}
