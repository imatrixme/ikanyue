import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { CourseCalendarWorkspace } from './CourseCalendarWorkspace'

describe('institution course calendar workspace', () => {
  it('renders week, month, list, URL filters, and a narrow-screen agenda fallback', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    expect(await screen.findByRole('heading', { name: '机构课表' })).toBeInTheDocument()
    expect((await screen.findAllByRole('button', { name: /少儿声乐小课/ })).length).toBeGreaterThan(0)
    expect(screen.getByTestId('calendar-time-grid')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-agenda')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('教师'), 'teacher_1')
    expect(screen.getByTestId('location')).toHaveTextContent('teacherId=teacher_1')
    await user.selectOptions(screen.getByLabelText('学员'), 'student_1')
    await user.selectOptions(screen.getByLabelText('班级'), 'class_1')
    await user.selectOptions(screen.getByLabelText('课程'), 'course_1')
    await user.selectOptions(screen.getByLabelText('课堂状态'), 'scheduled')
    await user.selectOptions(screen.getByLabelText('排课来源'), 'class')
    await user.selectOptions(screen.getByLabelText('教师'), '')
    expect(screen.getByTestId('location')).not.toHaveTextContent('teacherId=')
    await user.click(screen.getByRole('button', { name: '切换到月' }))
    expect(await screen.findByTestId('calendar-month-grid')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('view=month')
    await user.click(screen.getByRole('button', { name: '切换到列表' }))
    expect((await screen.findAllByText('班级排课')).length).toBeGreaterThan(1)
    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('teacherId=')
    await user.click(screen.getByRole('button', { name: '上一时间段' }))
    await user.click(screen.getByRole('button', { name: '下一时间段' }))
    await user.click(screen.getByRole('button', { name: '今天' }))
    await user.click(screen.getByRole('button', { name: '刷新机构课表' }))
  })

  it('opens lesson detail, follows the lesson route, reschedules, and cancels', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const reschedule = vi.spyOn(api, 'rescheduleLesson')
    const cancel = vi.spyOn(api, 'setCourseResourceStatus')
    const view = renderWorkspace(api, '/calendar?view=list&date=2026-08-03')
    await user.click((await screen.findAllByText('少儿声乐小课'))[0])
    let drawer = await screen.findByRole('dialog', { name: '少儿声乐小课' })
    expect(drawer).toHaveTextContent('周老师')
    await user.click(within(drawer).getByRole('button', { name: '进入课堂管理' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/lessons?sessionId=lesson_1')
    view.unmount()

    renderWorkspace(api, '/calendar?view=list&date=2026-08-03')
    await user.click((await screen.findAllByText('少儿声乐小课'))[0])
    drawer = await screen.findByRole('dialog', { name: '少儿声乐小课' })
    await user.click(within(drawer).getByRole('button', { name: '调整时间' }))
    let dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    await user.clear(within(dialog).getByLabelText('新开始时间'))
    await user.type(within(dialog).getByLabelText('新开始时间'), '2026-08-04T09:00')
    await user.clear(within(dialog).getByLabelText('新结束时间'))
    await user.type(within(dialog).getByLabelText('新结束时间'), '2026-08-04T10:00')
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(reschedule).toHaveBeenCalledWith('token', 'lesson_1', expect.any(String), expect.any(String), '教学安排调整')

    await user.click((await screen.findAllByText('少儿声乐小课'))[0])
    drawer = await screen.findByRole('dialog', { name: '少儿声乐小课' })
    await user.click(within(drawer).getByRole('button', { name: '取消课堂' }))
    dialog = screen.getByRole('dialog', { name: '取消课堂' })
    await user.click(within(dialog).getByRole('button', { name: '确认取消' }))
    expect(cancel).toHaveBeenCalledWith('token', 'lessons', 'lesson_1', 'cancelled', '教学安排取消')
  })

  it('shows load, detail, command, and version-conflict recovery states', async () => {
    const loadApi = createMockOpsApi()
    vi.spyOn(loadApi, 'getCourseCalendar').mockRejectedValueOnce(new Error('课表离线'))
    const loadView = renderWorkspace(loadApi)
    expect(await screen.findByText('课表离线')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '重新加载' }))
    expect((await screen.findAllByRole('button', { name: /少儿声乐小课/ })).length).toBeGreaterThan(0)
    loadView.unmount()

    const detailApi = createMockOpsApi()
    vi.spyOn(detailApi, 'getCourseResource').mockRejectedValueOnce('offline')
    const detailView = renderWorkspace(detailApi, '/calendar?view=list&date=2026-08-03')
    await userEvent.setup().click((await screen.findAllByText('少儿声乐小课'))[0])
    expect(await screen.findByText('课堂详情暂时无法加载，仍可查看日历摘要。')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '关闭弹窗' }))
    detailView.unmount()

    const conflictApi = createMockOpsApi()
    vi.spyOn(conflictApi, 'rescheduleLesson').mockRejectedValueOnce(new Error('VERSION 冲突'))
    renderWorkspace(conflictApi, '/calendar?view=list&date=2026-08-03')
    await userEvent.setup().click((await screen.findAllByText('少儿声乐小课'))[0])
    await userEvent.setup().click(within(await screen.findByRole('dialog', { name: '少儿声乐小课' })).getByRole('button', { name: '调整时间' }))
    const dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(await screen.findByText('课堂数据已变化，课表已刷新，请重新确认后操作。')).toBeInTheDocument()
  })

  it('keeps a failed non-conflict command open and resets an empty filtered state', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'setCourseResourceStatus').mockRejectedValueOnce(new Error('取消失败'))
    const failed = renderWorkspace(api, '/calendar?view=list&date=2026-08-03')
    await user.click((await screen.findAllByText('少儿声乐小课'))[0])
    await user.click(within(await screen.findByRole('dialog', { name: '少儿声乐小课' })).getByRole('button', { name: '取消课堂' }))
    await user.click(within(screen.getByRole('dialog', { name: '取消课堂' })).getByRole('button', { name: '确认取消' }))
    expect(await screen.findByText('取消失败')).toBeInTheDocument()
    failed.unmount()

    renderWorkspace(createMockOpsApi(), '/calendar?date=2026-08-03&teacherId=missing')
    expect(await screen.findByText('没有匹配的课程安排')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect((await screen.findAllByRole('button', { name: /少儿声乐小课/ })).length).toBeGreaterThan(0)
  })
})

function renderWorkspace(api = createMockOpsApi(), entry = '/calendar?date=2026-08-03') {
  return render(<MemoryRouter initialEntries={[entry]}><CourseCalendarWorkspace api={api} token="token" /><Location /></MemoryRouter>)
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}
