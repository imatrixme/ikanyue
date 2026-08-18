import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CourseCalendarEntry } from '../../app/calendarTypes'
import { CourseScheduleDrawer } from './CourseScheduleDrawer'
import { VisualCourseScheduler } from './VisualCourseScheduler'

describe('visual course scheduler', () => {
  it('opens occupied lessons and converts click or drag gestures into time selections', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onSelect = vi.fn()
    render(<VisualCourseScheduler dateKey="2026-08-03" entries={[entry()]} onOpen={onOpen} onSelect={onSelect} teachers={[{ id: 'teacher_1', name: '周老师' }]} />)

    await user.click(screen.getByRole('button', { name: /声乐小课/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ lessonId: 'lesson_1' }))

    const clickSlot = screen.getByRole('button', { name: '在周老师 2026-08-03 11:00新增排课' })
    fireEvent.pointerDown(clickSlot)
    fireEvent.pointerUp(clickSlot)
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      startAt: '2026-08-03T03:00:00.000Z', endAt: '2026-08-03T04:00:00.000Z',
    }))

    const dragStart = screen.getByRole('button', { name: '在周老师 2026-08-03 13:00新增排课' })
    const dragEnd = screen.getByRole('button', { name: '在周老师 2026-08-03 14:00新增排课' })
    fireEvent.pointerDown(dragStart)
    fireEvent.pointerEnter(dragEnd)
    fireEvent.pointerUp(dragEnd)
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      startAt: '2026-08-03T05:00:00.000Z', endAt: '2026-08-03T06:30:00.000Z',
    }))
  })

  it('derives named class configuration, repeats, and visible conflict behavior in the drawer', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const selection = { teacherId: 'teacher_1', teacherName: '周老师', startAt: '2026-08-03T03:00:00.000Z', endAt: '2026-08-03T04:00:00.000Z' }
    const courses = [{ id: 'course_1', code: 'VOCAL', name: '综合声乐', deliveryMode: 'group', durationMinutes: 90, teacherTier: 'standard', defaultCreditTypeId: 'credit_voice', status: 'active' }]
    const classes = [{ id: 'class_1', code: 'A', name: '周六声乐 A 班', courseSpecId: 'course_1', defaultCreditTypeId: 'credit_voice', termStart: '2026-08-01', termEnd: '2027-01-31', capacity: 12, location: '一号教室', status: 'active' }]
    const view = render(<CourseScheduleDrawer classes={classes} courses={courses} entries={[]} loading={false} onClose={vi.fn()} onSubmit={onSubmit} selection={selection} />)

    await user.selectOptions(screen.getByLabelText('班级'), 'class_1')
    expect(screen.getByLabelText('课堂名称')).toHaveValue('周六声乐 A 班')
    expect(screen.getByLabelText('地点')).toHaveValue('一号教室')
    expect(screen.getByLabelText('课时类型')).toHaveValue('随课程自动配置')
    expect(screen.getByLabelText('结束时间')).toHaveValue('2026-08-03T12:30')
    await user.selectOptions(screen.getByLabelText('重复'), '4')
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ classId: 'class_1', repeatCount: 4, teacherId: 'teacher_1' }), 'draft')
    view.unmount()

    render(<CourseScheduleDrawer classes={classes} courses={courses} entries={[entry({ startAt: selection.startAt, endAt: selection.endAt })]} loading={false} onClose={vi.fn()} onSubmit={onSubmit} selection={selection} />)
    await user.selectOptions(screen.getByLabelText('班级'), 'class_1')
    expect(screen.getByRole('alert')).toHaveTextContent('时间冲突')
    expect(screen.getByRole('button', { name: '创建并发布' })).toBeDisabled()
  })
})

function entry(overrides: Partial<CourseCalendarEntry> = {}): CourseCalendarEntry {
  const teacher = { id: 'teacher_1', name: '周老师' }
  const classItem = { id: 'class_1', name: '周六声乐 A 班' }
  const summary = (items: Array<{ id: string; name: string }>) => ({ count: items.length, items, label: items.map((item) => item.name).join('、'), overflow: 0 })
  return {
    lessonId: 'lesson_1', title: '声乐小课', course: { courseId: 'course_1', name: '综合声乐', deliveryMode: 'group' },
    startAt: '2026-08-03T01:00:00.000Z', endAt: '2026-08-03T02:00:00.000Z', location: '一号教室',
    status: 'scheduled', rawStatus: 'scheduled', originType: 'class', adjusted: false, attention: '',
    teacherSummary: summary([teacher]), classSummary: summary([classItem]), participantSummary: summary([]),
    appointmentId: null, version: 1, relationIds: { teacherIds: [teacher.id], studentIds: [], classIds: [classItem.id] },
    ...overrides,
  }
}
