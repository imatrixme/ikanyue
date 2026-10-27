import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { shanghaiLocalInput, shanghaiLocalInputToIso } from '../../app/calendarLogic'
import { formatDate, formatDateTime, lessonStep, localDateKey } from '../../app/coursePresentation'
import { NotifyProvider } from '../ui/Notify'
import { useNotify } from '../ui/notifyContext'
import { BookingWorkspace } from './BookingWorkspace'
import { CourseResourceWorkspace } from './CourseResourceWorkspace'
import { StudentDetailPage } from './StudentDetailPage'

describe('admin daily operations', () => {
  it('books a one-to-one lesson for a student from the student page', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const create = vi.spyOn(api, 'createAppointmentForStudent')
    render(<MemoryRouter><NotifyProvider><StudentDetailPage api={api} studentId="student_1" token="token" /></NotifyProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '代约一对一' }))
    const dialog = screen.getByRole('dialog', { name: '代约一对一' })
    const submit = within(dialog).getByRole('button', { name: '提交预约' })
    expect(submit).toBeDisabled()
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: '课程与教师' })).toBeEnabled())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '课程与教师' }), 'offering_1')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: '上课时间' })).toBeEnabled())
    const slot = within(dialog).getByRole('combobox', { name: '上课时间' }) as HTMLSelectElement
    await user.selectOptions(slot, slot.options[1].value)
    await user.type(within(dialog).getByRole('textbox', { name: '备注' }), '电话预约')
    await user.click(submit)
    expect(create).toHaveBeenCalledWith('token', expect.objectContaining({ studentId: 'student_1', offeringId: 'offering_1', startAt: slot.options[1].value, note: '电话预约', confirm: true }))
    expect(await screen.findByText('已代约并确认')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '代约一对一' })).not.toBeInTheDocument()
  })

  it('keeps the booking dialog open with the server reason when booking fails', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'createAppointmentForStudent').mockRejectedValueOnce(new Error('课时余额不足'))
    render(<MemoryRouter><BookingWorkspace api={api} token="token" /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '代约一对一' }))
    const dialog = screen.getByRole('dialog', { name: '代约一对一' })
    expect(within(dialog).getByRole('combobox', { name: '课程与教师' })).toBeDisabled()
    await user.click(within(dialog).getByRole('combobox', { name: '学员' }))
    await user.click(await within(dialog).findByRole('option', { name: /张同学/ }))
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: '课程与教师' })).toBeEnabled())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '课程与教师' }), 'offering_1')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: '上课时间' })).toBeEnabled())
    const slot = within(dialog).getByRole('combobox', { name: '上课时间' }) as HTMLSelectElement
    await user.selectOptions(slot, slot.options[1].value)
    await user.click(within(dialog).getByRole('checkbox', { name: /同时确认预约/ }))
    await user.click(within(dialog).getByRole('button', { name: '提交预约' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('课时余额不足')
  })

  it('records a renewal follow-up on the student page', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    render(<MemoryRouter><StudentDetailPage api={api} studentId="student_1" token="token" /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: '续课跟进' })
    expect(section).toHaveTextContent('还没有续课跟进')
    await user.click(screen.getByRole('button', { name: '记录跟进' }))
    const dialog = screen.getByRole('dialog', { name: '记录续课跟进' })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '跟进结果' }), 'declined')
    await user.type(within(dialog).getByRole('textbox', { name: '备注' }), '暑假后再联系')
    await user.click(within(dialog).getByRole('button', { name: '保存跟进' }))
    await waitFor(() => expect(screen.getByRole('region', { name: '续课跟进' })).toHaveTextContent('暑假后再联系'))
    expect(screen.getByRole('region', { name: '续课跟进' })).toHaveTextContent('暂不续')
  })

  it('shows the follow-up failure inside the dialog', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'recordFollowUp').mockRejectedValueOnce(new Error('下次提醒日期必须晚于现在'))
    render(<MemoryRouter><StudentDetailPage api={api} studentId="student_1" token="token" /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '记录跟进' }))
    const dialog = screen.getByRole('dialog', { name: '记录续课跟进' })
    await user.click(within(dialog).getByRole('button', { name: '保存跟进' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('下次提醒日期必须晚于现在')
    expect(screen.getByRole('region', { name: '续课跟进' })).toBeInTheDocument()
  })

  it('edits datetime fields in Shanghai time and saves UTC instants', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const create = vi.spyOn(api, 'createCourseResource').mockResolvedValue({ id: 'rule_2' })
    vi.spyOn(api, 'listCourseResource').mockResolvedValue({ items: [{ id: 'rule_1', validFrom: '2026-10-18 01:00:00.000Z', version: 1 }], page: 1, perPage: 100, totalItems: 1, totalPages: 1 })
    render(<CourseResourceWorkspace api={api} columns={[{ key: 'validFrom', label: '生效时间' }]} defaultValues={{ validFrom: '2026-10-19T09:30' }} fields={[{ key: 'validFrom', label: '生效时间', type: 'datetime-local', required: true }]} noun="兑换规则" resource="conversionRules" title="兑换规则" token="token" writableResource="conversion-rules" />)
    await user.click((await screen.findAllByRole('button', { name: '编辑' }))[0])
    expect(screen.getByLabelText('生效时间')).toHaveValue('2026-10-18T09:00')
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '新增兑换规则' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(create).toHaveBeenCalledWith('token', 'conversion-rules', expect.objectContaining({ validFrom: '2026-10-19T01:30:00.000Z' }))
  })

  it('formats and groups instants by the Shanghai day whatever the browser zone', () => {
    // 2026-10-18 23:30 UTC is 07:30 on 10-19 in Shanghai and still 10-18 in Los Angeles.
    expect(localDateKey('2026-10-18T23:30:00.000Z')).toBe('2026-10-19')
    expect(formatDateTime('2026-10-18T23:30:00.000Z')).toContain('07:30')
    expect(formatDate('2026-10-18T23:30:00.000Z')).toContain('19')
    expect(shanghaiLocalInputToIso(shanghaiLocalInput('2026-10-18T23:30:00.000Z'))).toBe('2026-10-18T23:30:00.000Z')
  })

  it('derives the lesson-day step from status and roster', () => {
    expect(lessonStep({ status: 'scheduled' }, [{ attendanceStatus: 'scheduled' }, { attendanceStatus: 'present' }])).toBe(0)
    expect(lessonStep({ status: 'in_progress' }, [{ attendanceStatus: 'present' }, { attendanceStatus: 'leave' }])).toBe(1)
    expect(lessonStep({ status: 'completed' }, [])).toBe(2)
    expect(lessonStep({ status: 'correction_pending' }, [])).toBe(2)
    expect(lessonStep({ status: 'settled' }, [])).toBe(3)
    expect(lessonStep({ status: 'cancelled' }, [])).toBeNull()
    expect(lessonStep({ status: 'draft' }, [])).toBeNull()
  })

  it('stacks at most three notices and dismisses them', async () => {
    const user = userEvent.setup()
    function Trigger() { const notify = useNotify(); return <button onClick={() => ['一', '二', '三', '四'].forEach((item) => notify(`提示${item}`))} type="button">触发</button> }
    render(<NotifyProvider><Trigger /></NotifyProvider>)
    await user.click(screen.getByRole('button', { name: '触发' }))
    const region = screen.getByRole('status')
    expect(region).not.toHaveTextContent('提示一')
    expect(region).toHaveTextContent('提示四')
    expect(within(region).getAllByRole('button', { name: '关闭提示' })).toHaveLength(3)
    await user.click(within(region).getAllByRole('button', { name: '关闭提示' })[0])
    expect(region).not.toHaveTextContent('提示二')
  })
})
