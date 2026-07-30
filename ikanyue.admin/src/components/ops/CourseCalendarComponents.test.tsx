import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CourseCalendarEntry, CourseCalendarResponse } from '../../app/calendarTypes'
import { CourseCalendarDrawer } from './CourseCalendarDrawer'
import { CourseCalendarToolbar } from './CourseCalendarToolbar'
import { CourseCalendarViews } from './CourseCalendarViews'

describe('course calendar presentation components', () => {
  it('renders and opens day, month overflow, and list status variants', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const entries = [
      entry('scheduled', { teacher: '', className: 'A班', location: '', originType: 'class' }),
      entry('appointment', { minute: 30, originType: 'appointment' }),
      entry('cancelled', { minute: 90, rawStatus: 'cancelled', originType: 'admin' }),
      entry('completed', { minute: 150, rawStatus: 'completed', originType: 'admin' }),
      entry('settled', { minute: 210, rawStatus: 'settled', originType: 'admin' }),
      entry('missing-time', { startAt: null, endAt: null, teacher: '', className: '', location: '' }),
    ]
    const day = render(<CourseCalendarViews dateKey="2026-08-03" days={['2026-08-03']} entries={entries} onOpen={onOpen} view="day" />)
    await user.click(screen.getAllByRole('button', { name: /scheduled/ })[0])
    await user.click(screen.getAllByRole('button', { name: /appointment/ })[0])
    expect(onOpen).toHaveBeenCalledTimes(2)
    day.unmount()

    const overflow = Array.from({ length: 5 }, (_, index) => entry(`month-${index}`, { minute: index * 30 }))
    const month = render(<CourseCalendarViews dateKey="2026-08-03" days={['2026-07-27', '2026-08-03']} entries={overflow} onOpen={onOpen} view="month" />)
    expect(screen.getByText('另有 2 节')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /month-0/ }))
    month.unmount()

    render(<CourseCalendarViews dateKey="2026-08-03" days={['2026-08-03']} entries={entries} onOpen={onOpen} view="list" />)
    expect(screen.getAllByText('已取消').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已核销').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('scheduled')[0].closest('tr')!)
    await user.click(screen.getAllByRole('button', { name: /scheduled/ }).at(-1)!)
  })

  it('covers empty agenda and all toolbar callbacks', async () => {
    const user = userEvent.setup()
    const callbacks = { onFilter: vi.fn(), onReset: vi.fn(), onShift: vi.fn(), onToday: vi.fn(), onView: vi.fn() }
    const facets: CourseCalendarResponse['facets'] = {
      teachers: [{ id: 't', name: '教师' }], students: [{ id: 's', name: '学员' }],
      classes: [{ id: 'c', name: '班级' }], courses: [{ id: 'course', name: '课程' }],
    }
    const view = render(<CourseCalendarToolbar dateLabel="本周" facets={facets} filters={{ teacherId: '', studentId: '', classId: '', courseSpecId: '', status: '', originType: '' }} {...callbacks} view="week" />)
    for (const [label, value] of [['教师', 't'], ['学员', 's'], ['班级', 'c'], ['课程', 'course'], ['课堂状态', 'scheduled'], ['排课来源', 'class']] as const) {
      await user.selectOptions(screen.getByLabelText(label), value)
    }
    await user.click(screen.getByRole('button', { name: '上一时间段' }))
    await user.click(screen.getByRole('button', { name: '下一时间段' }))
    await user.click(screen.getByRole('button', { name: '今天' }))
    await user.click(screen.getByRole('button', { name: '切换到日' }))
    expect(callbacks.onFilter).toHaveBeenCalledTimes(6)
    expect(callbacks.onShift).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(render(<CourseCalendarViews dateKey="2026-08-03" days={['2026-08-03']} entries={[]} onOpen={vi.fn()} view="list" />).container).toBeEmptyDOMElement()
  })

  it('covers sparse, immutable, rejected, and accepted drawer actions', async () => {
    const user = userEvent.setup()
    const actions = { onCancel: vi.fn().mockResolvedValue(false), onClose: vi.fn(), onOpenLesson: vi.fn(), onReschedule: vi.fn().mockResolvedValue(false) }
    const sparse = entry('sparse', { startAt: null, endAt: null, teacher: '', className: '', location: '', adjusted: true, attention: '教务处理中' })
    const view = render(<CourseCalendarDrawer detail={null} entry={sparse} error="操作失败" loading={false} {...actions} />)
    expect(screen.getByText('已改期')).toBeInTheDocument()
    expect(screen.getByText('教务处理中')).toBeInTheDocument()
    expect(screen.getAllByText('待安排')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '进入课堂管理' }))
    await user.click(screen.getByRole('button', { name: '调整时间' }))
    let dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    fireEvent.submit(within(dialog).getByRole('button', { name: '确认调整' }).closest('form')!)
    await user.type(within(dialog).getByLabelText('新开始时间'), '2026-08-04T09:00')
    await user.type(within(dialog).getByLabelText('新结束时间'), '2026-08-04T10:00')
    await user.clear(within(dialog).getByLabelText('调整原因'))
    await user.type(within(dialog).getByLabelText('调整原因'), '调整')
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(actions.onReschedule).toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '返回' }))
    await user.click(screen.getByRole('button', { name: '取消课堂' }))
    dialog = screen.getByRole('dialog', { name: '取消课堂' })
    await user.clear(within(dialog).getByLabelText('取消原因'))
    fireEvent.submit(within(dialog).getByRole('button', { name: '确认取消' }).closest('form')!)
    await user.type(within(dialog).getByLabelText('取消原因'), '取消')
    await user.click(within(dialog).getByRole('button', { name: '确认取消' }))
    expect(actions.onCancel).toHaveBeenCalled()
    view.unmount()

    const accepted = { ...actions, onCancel: vi.fn().mockResolvedValue(true), onReschedule: vi.fn().mockResolvedValue(true) }
    const acceptedView = render(<CourseCalendarDrawer detail={{ id: 'x', version: 3 } as never} entry={entry('accepted')} loading={false} {...accepted} />)
    await user.click(screen.getByRole('button', { name: '取消课堂' }))
    await user.click(within(screen.getByRole('dialog', { name: '取消课堂' })).getByRole('button', { name: '确认取消' }))
    expect(await screen.findByRole('dialog', { name: 'accepted' })).toBeInTheDocument()
    acceptedView.unmount()

    render(<CourseCalendarDrawer detail={null} entry={entry('locked', { rawStatus: 'cancelled', location: '' })} loading={false} {...actions} />)
    expect(screen.queryByRole('button', { name: '调整时间' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消课堂' })).not.toBeInTheDocument()
  })
})

function entry(id: string, options: { adjusted?: boolean; attention?: string; className?: string; endAt?: string | null; location?: string; minute?: number; originType?: string; rawStatus?: string; startAt?: string | null; teacher?: string } = {}): CourseCalendarEntry {
  const minute = options.minute || 0
  const startAt = options.startAt === undefined ? new Date(Date.parse('2026-08-03T01:00:00.000Z') + minute * 60000).toISOString() : options.startAt
  const endAt = options.endAt === undefined ? new Date(Date.parse(startAt || '2026-08-03T01:00:00.000Z') + 3600000).toISOString() : options.endAt
  const teacher = options.teacher === undefined ? '周老师' : options.teacher
  const className = options.className === undefined ? 'A班' : options.className
  const summary = (label: string) => ({ count: label ? 1 : 0, items: label ? [{ id: label, name: label }] : [], label, overflow: 0 })
  return {
    lessonId: id, title: id, course: { courseId: 'course', name: '课程', deliveryMode: '' },
    startAt, endAt, location: options.location === undefined ? '一号教室' : options.location,
    status: options.rawStatus || 'scheduled', rawStatus: options.rawStatus || 'scheduled',
    originType: options.originType || 'class', adjusted: options.adjusted || false, attention: options.attention || '',
    teacherSummary: summary(teacher), classSummary: summary(className), participantSummary: summary('学员'),
    appointmentId: null, version: 1,
    relationIds: { teacherIds: [], studentIds: [], classIds: [] },
  }
}
