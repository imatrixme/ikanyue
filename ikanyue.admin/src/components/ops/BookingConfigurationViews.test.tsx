import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { BookingConfigurationViews } from './BookingConfigurationViews'

describe('booking configuration workspace', () => {
  it('manages offerings, weekly availability, date overrides, and policy revisions', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    const saveOffering = vi.spyOn(api, 'saveBookingOffering')
    const saveWeekly = vi.spyOn(api, 'saveBookingWeeklyAvailability')
    const createOverride = vi.spyOn(api, 'createBookingAvailabilityOverride')
    const cancelOverride = vi.spyOn(api, 'cancelBookingAvailabilityOverride')
    const createPolicy = vi.spyOn(api, 'createBookingPolicy')
    render(<BookingConfigurationViews api={api} referenceData={refs} token="token" />)

    expect(await screen.findByRole('heading', { name: '教师可预约课程' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    let dialog = screen.getByRole('dialog', { name: '编辑预约课程' })
    await user.selectOptions(within(dialog).getByLabelText('预约状态'), 'inactive')
    await user.click(within(dialog).getByRole('button', { name: '保存预约课程' }))
    expect(saveOffering).toHaveBeenCalledWith('token', 'offering_1', expect.objectContaining({ status: 'inactive' }))
    await user.click(screen.getByRole('button', { name: '新增教师课程' }))
    dialog = screen.getByRole('dialog', { name: '新增预约课程' })
    await user.click(within(dialog).getByRole('button', { name: '取消' }))

    await user.click(screen.getByRole('button', { name: '切换到开放时间' }))
    expect(await screen.findByRole('heading', { name: '每周开放' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '每周时间' }))
    dialog = screen.getByRole('dialog', { name: '每周可预约时间' })
    await user.click(within(dialog).getByRole('button', { name: '保存每周时间' }))
    expect(saveWeekly).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '日期例外' }))
    dialog = screen.getByRole('dialog', { name: '新增日期例外' })
    await user.type(within(dialog).getByLabelText('日期'), '2030-08-20')
    await user.click(within(dialog).getByRole('button', { name: '保存日期例外' }))
    expect(createOverride).toHaveBeenCalled()
    await user.click((await screen.findAllByRole('button', { name: '撤销日期例外' }))[0])
    dialog = screen.getByRole('dialog', { name: '撤销日期例外' })
    await user.click(within(dialog).getByRole('button', { name: '确认撤销' }))
    expect(cancelOverride).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '切换到预约策略' }))
    expect(await screen.findByRole('heading', { name: '机构预约策略' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '新版本' })[0])
    dialog = screen.getByRole('dialog', { name: /修订/ })
    await user.click(within(dialog).getByRole('button', { name: '保存策略版本' }))
    expect(createPolicy).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '新增策略' }))
    dialog = screen.getByRole('dialog', { name: '新增预约策略' })
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '刷新预约配置' }))
  })

  it('renders empty configuration states and safe error fallbacks', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'listBookingPolicies').mockResolvedValue({ items: [], page: 1, perPage: 100, totalItems: 0, totalPages: 0 })
    vi.spyOn(api, 'listBookingOfferings').mockResolvedValue({ items: [], page: 1, perPage: 100, totalItems: 0, totalPages: 0 })
    const view = render(<BookingConfigurationViews api={api} referenceData={refs} token="token" />)
    expect(await screen.findByText('还没有教师预约课程')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换到开放时间' }))
    expect(await screen.findByText('还没有可维护的教师预约课程')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换到预约策略' }))
    expect(await screen.findByText('还没有预约策略')).toBeInTheDocument()
    view.unmount()

    const errorApi = createMockOpsApi()
    vi.spyOn(errorApi, 'listBookingPolicies').mockRejectedValueOnce(new Error('配置接口失败'))
    render(<BookingConfigurationViews api={errorApi} referenceData={refs} token="token" />)
    expect(await screen.findByText('配置接口失败')).toBeInTheDocument()
  })

  it('surfaces command and availability failures without closing the workspace', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'saveBookingOffering').mockRejectedValueOnce('offline')
    vi.spyOn(api, 'getBookingAvailability').mockRejectedValueOnce(new Error('开放时间失败'))
    render(<BookingConfigurationViews api={api} referenceData={refs} token="token" />)
    expect(await screen.findByRole('heading', { name: '教师可预约课程' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    const dialog = screen.getByRole('dialog', { name: '编辑预约课程' })
    await user.click(within(dialog).getByRole('button', { name: '保存预约课程' }))
    expect(await screen.findByText('保存预约课程失败')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '切换到开放时间' }))
    expect(await screen.findByText('开放时间失败')).toBeInTheDocument()
  })

  it('renders defensive configuration fallbacks and supports cancelling every editor', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const refs = await api.getBookingReferenceData('token')
    const policyPage = await api.listBookingPolicies('token', {})
    const offeringPage = await api.listBookingOfferings('token', {})
    const basePolicy = policyPage.items[0]
    const baseOffering = offeringPage.items[0]
    vi.spyOn(api, 'listBookingPolicies').mockResolvedValue({
      items: [
        { ...basePolicy, id: 'policy_draft', minLeadMinutes: 1440, status: 'draft' },
        { ...basePolicy, id: 'policy_inactive', minLeadMinutes: 90, status: 'inactive' },
        { ...basePolicy, id: 'policy_active', minLeadMinutes: 60, status: 'active' },
      ],
      page: 1,
      perPage: 100,
      totalItems: 3,
      totalPages: 1,
    })
    vi.spyOn(api, 'listBookingOfferings').mockResolvedValue({
      items: [
        { ...baseOffering, id: 'offering_default', availabilityMode: 'default', location: '', status: 'draft' },
        { ...baseOffering, id: 'offering_inactive', status: 'inactive' },
      ],
      page: 1,
      perPage: 100,
      totalItems: 2,
      totalPages: 1,
    })
    vi.spyOn(api, 'getBookingAvailability').mockResolvedValue({
      rules: [{ weekday: 9, startMinute: 540, endMinute: 660, status: 'active' }],
      overrides: [{ id: 'override_available', teacherId: 'teacher_1', offeringId: 'offering_default', type: 'available', startAt: 'not-a-date', endAt: 'not-a-date', reason: '', status: 'active' }],
    })

    render(<BookingConfigurationViews api={api} referenceData={refs} token="token" />)
    expect(await screen.findByRole('heading', { name: '教师可预约课程' })).toBeInTheDocument()
    expect(screen.getAllByText('待确认').length).toBeGreaterThan(0)
    expect(screen.getAllByText('机构默认').length).toBeGreaterThan(0)
    expect(screen.getAllByText('草稿').length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: '编辑预约课程' })[0])
    await user.click(within(screen.getByRole('dialog', { name: '编辑预约课程' })).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '新增教师课程' }))
    await user.click(within(screen.getByRole('dialog', { name: '新增预约课程' })).getByRole('button', { name: '保存预约课程' }))

    await user.click(screen.getByRole('button', { name: '切换到开放时间' }))
    expect(await screen.findByText('星期 9')).toBeInTheDocument()
    expect(screen.getByText('临时加开')).toBeInTheDocument()
    expect(screen.getByText(/无说明/)).toBeInTheDocument()
    expect(screen.getByText('not-a-date')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('教师课程'), 'offering_inactive')

    await user.click(screen.getByRole('button', { name: '每周时间' }))
    await user.click(within(screen.getByRole('dialog', { name: '每周可预约时间' })).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '日期例外' }))
    await user.click(within(screen.getByRole('dialog', { name: '新增日期例外' })).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '撤销日期例外' }))
    await user.click(within(screen.getByRole('dialog', { name: '撤销日期例外' })).getByRole('button', { name: '取消' }))

    await user.click(screen.getByRole('button', { name: '切换到预约策略' }))
    expect(await screen.findByText('提前 1 天')).toBeInTheDocument()
    expect(screen.getByText('提前 90 分钟')).toBeInTheDocument()
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: '创建新版本' })[0])
    await user.click(within(screen.getByRole('dialog', { name: /修订/ })).getByRole('button', { name: '取消' }))
  })
})
