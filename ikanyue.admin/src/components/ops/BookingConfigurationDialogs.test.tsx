import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BookingOffering, BookingPolicy, BookingReferenceData } from '../../app/bookingTypes'
import { BookingOfferingDialog, BookingOverrideDialog, BookingPolicyDialog, BookingWeeklyRulesDialog } from './BookingConfigurationDialogs'

describe('booking configuration dialogs', () => {
  it('creates and revises versioned policies with validated institution windows', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const view = render(<BookingPolicyDialog loading={false} onClose={onClose} onSave={onSave} />)
    const dialog = screen.getByRole('dialog', { name: '新增预约策略' })
    await user.clear(within(dialog).getByLabelText('下午开始时间'))
    await user.clear(within(dialog).getByLabelText('下午结束时间'))
    await user.click(within(dialog).getByRole('button', { name: '保存策略版本' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ code: 'standard-one-to-one', defaultWindows: [{ startMinute: 540, endMinute: 660 }] }))
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('window1Start')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalled()
    view.unmount()

    render(<BookingPolicyDialog base={policy()} loading={false} onClose={onClose} onSave={onSave} />)
    const revision = screen.getByRole('dialog', { name: '修订 常规一对一预约' })
    expect(within(revision).getByLabelText('策略编码')).toBeDisabled()
    await user.clear(within(revision).getByLabelText('下午开始时间'))
    await user.type(within(revision).getByLabelText('下午开始时间'), '10:00')
    expect(within(revision).getByRole('button', { name: '保存策略版本' })).toBeDisabled()
    await user.clear(within(revision).getByLabelText('下午开始时间'))
    await user.type(within(revision).getByLabelText('下午开始时间'), '14:00')
    await user.click(within(revision).getByRole('button', { name: '保存策略版本' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }] }))
  })

  it('edits every policy control and rejects an invalid direct form submission', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const view = render(<BookingPolicyDialog loading={false} onClose={vi.fn()} onSave={onSave} />)
    const dialog = screen.getByRole('dialog', { name: '新增预约策略' })
    fireEvent.change(within(dialog).getByLabelText('策略编码'), { target: { value: 'voice-private' } })
    fireEvent.change(within(dialog).getByLabelText('策略名称'), { target: { value: '声乐私教预约' } })
    fireEvent.change(within(dialog).getByLabelText('上午开始时间'), { target: { value: '08:30' } })
    fireEvent.change(within(dialog).getByLabelText('上午结束时间'), { target: { value: '11:30' } })
    fireEvent.change(within(dialog).getByLabelText('可选时段步长（分钟）'), { target: { value: '20' } })
    fireEvent.change(within(dialog).getByLabelText('时间占用粒度（分钟）'), { target: { value: '10' } })
    fireEvent.change(within(dialog).getByLabelText('最早提前（分钟）'), { target: { value: '180' } })
    fireEvent.change(within(dialog).getByLabelText('最远可约（天）'), { target: { value: '14' } })
    fireEvent.change(within(dialog).getByLabelText('教师响应时限（分钟）'), { target: { value: '720' } })
    fireEvent.change(within(dialog).getByLabelText('开课前响应截止（分钟）'), { target: { value: '120' } })
    fireEvent.change(within(dialog).getByLabelText('学员取消截止（分钟）'), { target: { value: '240' } })
    fireEvent.change(within(dialog).getByLabelText('生效时间'), { target: { value: '2030-08-01T09:00' } })
    fireEvent.change(within(dialog).getByLabelText('发布状态'), { target: { value: 'draft' } })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      code: 'voice-private',
      name: '声乐私教预约',
      slotStepMinutes: 20,
      claimGranularityMinutes: 10,
      status: 'draft',
    }))

    fireEvent.change(within(dialog).getByLabelText('上午结束时间'), { target: { value: '08:00' } })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    view.unmount()

    render(<BookingPolicyDialog base={{ ...policy(), status: 'draft', defaultWindows: [] }} loading onClose={vi.fn()} onSave={onSave} />)
    expect(screen.getByRole('dialog', { name: '修订 常规一对一预约' })).toBeInTheDocument()
  })

  it('creates and edits teacher-course offerings from safe reference selectors', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const view = render(<BookingOfferingDialog loading={false} onClose={onClose} onSave={onSave} referenceData={references()} />)
    const dialog = screen.getByRole('dialog', { name: '新增预约课程' })
    await user.selectOptions(within(dialog).getByLabelText('课程'), 'course_2')
    expect(within(dialog).getByLabelText('对应课时')).toHaveValue('credit_2')
    await user.selectOptions(within(dialog).getByLabelText('授课教师'), 'teacher_2')
    await user.selectOptions(within(dialog).getByLabelText('预约状态'), 'active')
    await user.type(within(dialog).getByLabelText('默认上课地点'), '三号琴房')
    await user.click(within(dialog).getByRole('button', { name: '保存预约课程' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'teacher_2', courseSpecId: 'course_2', creditTypeId: 'credit_2', status: 'active' }))
    view.unmount()

    render(<BookingOfferingDialog loading={false} offering={offering()} onClose={onClose} onSave={onSave} referenceData={references()} />)
    const edit = screen.getByRole('dialog', { name: '编辑预约课程' })
    expect(within(edit).getByLabelText('授课教师')).toBeDisabled()
    expect(within(edit).getByLabelText('课程')).toBeDisabled()
    await user.click(within(edit).getByRole('button', { name: '取消' }))
  })

  it('handles explicit offering selectors and empty reference data safely', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const refs = references()
    const view = render(<BookingOfferingDialog loading={false} onClose={vi.fn()} onSave={onSave} referenceData={refs} />)
    const dialog = screen.getByRole('dialog', { name: '新增预约课程' })
    fireEvent.change(within(dialog).getByLabelText('对应课时'), { target: { value: 'credit_1' } })
    fireEvent.change(within(dialog).getByLabelText('预约策略'), { target: { value: 'policy_1' } })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    view.unmount()

    const emptyRefs: BookingReferenceData = { teachers: [], courses: [], creditTypes: [], policies: [] }
    render(<BookingOfferingDialog loading={false} onClose={vi.fn()} onSave={onSave} referenceData={emptyRefs} />)
    const emptyDialog = screen.getByRole('dialog', { name: '新增预约课程' })
    fireEvent.submit(emptyDialog.querySelector('form')!)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('edits weekly rules, detects overlap, restores defaults, and saves date overrides', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const rulesView = render(<BookingWeeklyRulesDialog loading={false} onClose={onClose} onSave={onSave} rules={[{ id: 'rule_1', weekday: 1, startMinute: 540, endMinute: 660 }, { id: 'rule_2', weekday: 1, startMinute: 840, endMinute: 900 }]} />)
    const rulesDialog = screen.getByRole('dialog', { name: '每周可预约时间' })
    await user.clear(within(rulesDialog).getByLabelText('第2条开始时间'))
    await user.type(within(rulesDialog).getByLabelText('第2条开始时间'), '10:00')
    expect(screen.getByText(/同一天的时段不能重叠/)).toBeInTheDocument()
    expect(within(rulesDialog).getByRole('button', { name: '保存每周时间' })).toBeDisabled()
    await user.clear(within(rulesDialog).getByLabelText('第2条开始时间'))
    await user.type(within(rulesDialog).getByLabelText('第2条开始时间'), '14:00')
    await user.clear(within(rulesDialog).getByLabelText('第2条结束时间'))
    await user.type(within(rulesDialog).getByLabelText('第2条结束时间'), '15:30')
    await user.click(within(rulesDialog).getByRole('button', { name: '添加时段' }))
    await user.selectOptions(within(rulesDialog).getByLabelText('第3条星期'), '2')
    await user.click(within(rulesDialog).getAllByRole('button', { name: '删除时段' })[2])
    await user.click(within(rulesDialog).getByRole('button', { name: '保存每周时间' }))
    expect(onSave).toHaveBeenCalledWith([{ weekday: 1, startMinute: 540, endMinute: 660 }, { weekday: 1, startMinute: 840, endMinute: 930 }])
    rulesView.unmount()

    const emptyView = render(<BookingWeeklyRulesDialog loading={false} onClose={onClose} onSave={onSave} rules={[]} />)
    expect(screen.getByText('当前使用机构默认开放时间。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存每周时间' }))
    expect(onSave).toHaveBeenLastCalledWith([])
    emptyView.unmount()

    render(<BookingOverrideDialog loading={false} onClose={onClose} onSave={onSave} />)
    const override = screen.getByRole('dialog', { name: '新增日期例外' })
    expect(within(override).getByRole('button', { name: '保存日期例外' })).toBeDisabled()
    await user.type(within(override).getByLabelText('日期'), '2030-08-20')
    await user.selectOptions(within(override).getByLabelText('例外类型'), 'available')
    await user.clear(within(override).getByLabelText('开始'))
    await user.type(within(override).getByLabelText('开始'), '14:00')
    await user.clear(within(override).getByLabelText('结束'))
    await user.type(within(override).getByLabelText('结束'), '16:00')
    await user.clear(within(override).getByLabelText('说明'))
    fireEvent.submit(override.querySelector('form')!)
    expect(onSave).toHaveBeenCalledTimes(2)
    await user.type(within(override).getByLabelText('说明'), '临时加开')
    await user.click(within(override).getByRole('button', { name: '保存日期例外' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'available', reason: '临时加开' }))
  })
})

function policy(): BookingPolicy {
  return { id: 'policy_1', code: 'default', name: '常规一对一预约', timezone: 'Asia/Shanghai', defaultWindows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 840, endMinute: 1140 }], slotStepMinutes: 30, claimGranularityMinutes: 15, minLeadMinutes: 720, maxAdvanceDays: 30, responseTtlMinutes: 1440, responseCutoffMinutes: 360, cancellationCutoffMinutes: 720, version: 1, effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: null, status: 'active' }
}

function references(): BookingReferenceData {
  return { teachers: [{ id: 'teacher_1', name: '林老师', cellphone: '13800000001', avatar: '' }, { id: 'teacher_2', name: '周老师', cellphone: '13800000002', avatar: '' }], courses: [{ id: 'course_1', code: 'VOICE-1', name: '声乐一对一', durationMinutes: 60, defaultCreditTypeId: 'credit_1' }, { id: 'course_2', code: 'VOICE-2', name: '视唱练耳一对一', durationMinutes: 45, defaultCreditTypeId: 'credit_2' }], creditTypes: [{ id: 'credit_1', code: 'HOUR-1', name: '声乐课时', courseSpecId: 'course_1', unitLabel: '课时' }, { id: 'credit_2', code: 'HOUR-2', name: '视唱练耳课时', courseSpecId: 'course_2', unitLabel: '课时' }], policies: [policy()] }
}

function offering(): BookingOffering {
  return { id: 'offering_1', teacher: { teacherId: 'teacher_1', name: '林老师' }, course: { courseId: 'course_1', name: '声乐一对一' }, creditTypeId: 'credit_1', policyId: 'policy_1', location: '二号琴房', availabilityMode: 'custom', status: 'active', version: 1 }
}
