import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CoursePage, CourseQuery, CourseRecord, CourseResourceKey, Lesson } from '../../app/courseTypes'
import { mockProfiles } from '../../app/mockData'
import { LessonsWorkspace } from './LessonsWorkspace'

const draftLesson: Lesson = {
  id: 'lesson_draft', code: 'LESSON-DRAFT', title: '待发布课堂', startAt: '2026-09-08T10:00:00.000Z',
  endAt: '2026-09-08T11:00:00.000Z', location: '二号教室', requiredCreditTypeId: 'credit_voice',
  requiredQuantity: 1, rosterVersion: 1, version: 1, status: 'draft',
}

describe('lesson workspace coverage', () => {
  it('covers academic create, edit, publish, attendance, reschedule, cancel, and mobile detail actions', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    await api.createCourseResource('token', 'lessons', draftLesson)
    const create = vi.spyOn(api, 'createCourseResource')
    const update = vi.spyOn(api, 'updateCourseResource')
    const publish = vi.spyOn(api, 'publishLesson')
    const reschedule = vi.spyOn(api, 'rescheduleLesson')
    const attendance = vi.spyOn(api, 'setAttendance')
    const teacher = vi.spyOn(api, 'setActualTeacher')
    const status = vi.spyOn(api, 'setCourseResourceStatus')
    renderLessons(api)

    expect(await screen.findByRole('heading', { name: '课堂管理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '编辑' }))
    let dialog = screen.getByRole('dialog', { name: '编辑课堂' })
    await user.clear(within(dialog).getByLabelText('课堂名称'))
    await user.type(within(dialog).getByLabelText('课堂名称'), '编辑后的课堂')
    await user.clear(within(dialog).getByLabelText('每人课时'))
    await user.type(within(dialog).getByLabelText('每人课时'), '2')
    await user.click(within(dialog).getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('token', 'lessons', 'lesson_draft', expect.objectContaining({ title: '编辑后的课堂', requiredQuantity: 2 })))

    await user.click(screen.getByRole('button', { name: '发布' }))
    dialog = screen.getByRole('dialog', { name: /发布 编辑后的课堂/ })
    await user.type(within(dialog).getByLabelText('班级编号'), ' class_1, class_2, ')
    await user.click(within(dialog).getByRole('button', { name: '发布课堂' }))
    await waitFor(() => expect(publish).toHaveBeenCalledWith('token', 'lesson_draft', ['class_1', 'class_2']))

    await user.click(screen.getByRole('button', { name: '新增课堂' }))
    dialog = screen.getByRole('dialog', { name: '新增课堂' })
    fillLesson(dialog)
    await user.click(within(dialog).getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', 'lessons', expect.objectContaining({ code: 'LESSON-NEW', title: '新课堂', requiredQuantity: 1 })))

    let drawer = await openLesson(user, '合唱排练')
    await user.selectOptions(within(drawer).getByLabelText('学员student_1出勤'), 'late')
    await waitFor(() => expect(attendance).toHaveBeenCalledWith('token', 'lesson_1', 'session_student_1', 'late'))
    await user.selectOptions(within(drawer).getByLabelText('教师teacher_1实际状态'), 'absent')
    await waitFor(() => expect(teacher).toHaveBeenCalledWith('token', 'lesson_1', 'session_teacher_1', 'absent'))
    await user.click(within(drawer).getByRole('button', { name: '调整时间' }))
    dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    fireEvent.change(within(dialog).getByLabelText('新开始时间'), { target: { value: '2026-08-09T10:00' } })
    fireEvent.change(within(dialog).getByLabelText('新结束时间'), { target: { value: '2026-08-09T11:00' } })
    await user.clear(within(dialog).getByLabelText('原因'))
    await user.type(within(dialog).getByLabelText('原因'), '场地调整')
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    await waitFor(() => expect(reschedule).toHaveBeenCalledWith('token', 'lesson_1', '2026-08-09T02:00:00.000Z', '2026-08-09T03:00:00.000Z', '场地调整'))

    drawer = await openLesson(user, '合唱排练')
    await user.click(within(drawer).getByRole('button', { name: '取消课堂' }))
    await user.click(screen.getByRole('button', { name: '取消' }))
    drawer = await openLesson(user, '合唱排练')
    await user.click(within(drawer).getByRole('button', { name: '取消课堂' }))
    await user.click(screen.getByRole('button', { name: '确认取消' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('token', 'lessons', 'lesson_1', 'cancelled', 'admin_cancelled'))

    await user.click(screen.getAllByRole('button', { name: '课堂详情' }).at(-1)!)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
  })

  it('surfaces load, save, publish, reschedule, detail, preview, and action failures', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    await api.createCourseResource('token', 'lessons', draftLesson)
    vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce('offline')
    renderLessons(api)
    expect(await screen.findByText('加载课堂失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'createCourseResource').mockRejectedValueOnce('save offline')
    await user.click(screen.getByRole('button', { name: '新增课堂' }))
    let dialog = screen.getByRole('dialog', { name: '新增课堂' })
    fillLesson(dialog)
    await user.click(within(dialog).getByRole('button', { name: '保存草稿' }))
    expect(await screen.findByText('保存课堂失败')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'publishLesson').mockRejectedValueOnce(new Error('publish failed'))
    await user.click(screen.getByRole('button', { name: '发布' }))
    dialog = screen.getByRole('dialog', { name: /发布 待发布课堂/ })
    await user.type(within(dialog).getByLabelText('班级编号'), 'class_1')
    await user.click(within(dialog).getByRole('button', { name: '发布课堂' }))
    expect(await screen.findByText('publish failed')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce(new Error('detail failed'))
    await user.click(screen.getAllByRole('button', { name: '课堂详情' })[0])
    expect(await screen.findByText('detail failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'rescheduleLesson').mockRejectedValueOnce('reschedule offline')
    await user.click(within(await openLesson(user, '合唱排练')).getByRole('button', { name: '调整时间' }))
    dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    await user.click(within(dialog).getByRole('button', { name: '确认调整' }))
    expect(await screen.findByText('调整课堂时间失败')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    await api.setCourseResourceStatus('token', 'lessons', 'lesson_1', 'completed')
    vi.spyOn(api, 'previewSettlement').mockRejectedValueOnce('preview offline')
    await user.click(screen.getByRole('button', { name: '重新加载课堂' }))
    await user.click(within(await openLesson(user, '合唱排练')).getByRole('button', { name: '核销预览' }))
    expect(await screen.findByText('加载核销预览失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'setCourseResourceStatus').mockRejectedValueOnce(new Error('action failed'))
    await user.click(within(await openLesson(user, '合唱排练')).getByRole('button', { name: '取消课堂' }))
    await user.click(screen.getByRole('button', { name: '确认取消' }))
    expect(await screen.findByText('action failed')).toBeInTheDocument()
  })

  it('rejects a lesson removed from the current teacher assignment', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const original = api.listCourseResource.bind(api)
    api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}) => {
      if (resource === 'assignedLessons' && query.sessionId) return { items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 } as CoursePage<T>
      return original<T>(token, resource, query)
    }
    const teacherOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher' as const] }
    render(<MemoryRouter><LessonsWorkspace api={api} profile={teacherOnly} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '课堂详情' }))[0])
    expect(await screen.findByText('课堂不在当前教师的授课范围内')).toBeInTheDocument()
  })

  it('covers sparse lesson dates, settlement fallbacks, and teacher edit boundaries', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    await api.createCourseResource('token', 'lessons', {
      id: 'lesson_sparse', code: 'SPARSE', title: '无时间课堂', startAt: '', endAt: '', location: '',
      requiredCreditTypeId: 'credit_voice', requiredQuantity: 1, rosterVersion: 1, version: 1, status: 'completed',
    })
    await api.createCourseResource('token', 'lessons', {
      id: 'lesson_invalid', code: 'INVALID', title: '非法时间课堂', startAt: 'invalid-date', endAt: 'invalid-date', location: '',
      requiredCreditTypeId: 'credit_voice', requiredQuantity: 1, rosterVersion: 1, version: 1, status: 'cancelled',
    })
    const originalList = api.listCourseResource.bind(api)
    api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}) => {
      if (resource === 'sessionStudents' && query.sessionId === 'lesson_sparse') return page<T>([{ id: 'student_sparse', sessionId: 'lesson_sparse', studentId: 'student_sparse', attendanceStatus: 'scheduled', creditStatus: '' }])
      if (resource === 'sessionTeachers' && query.sessionId === 'lesson_sparse') return page<T>([{ id: 'teacher_sparse', sessionId: 'lesson_sparse', teacherId: 'teacher_1', role: '', actualStatus: '' }])
      return originalList<T>(token, resource, query)
    }
    const create = vi.spyOn(api, 'createCourseResource')
    vi.spyOn(api, 'previewSettlement').mockResolvedValue({ sessionId: 'lesson_sparse' } as never)
    const view = renderLessons(api)
    expect(await screen.findByText('1 节待核销')).toBeInTheDocument()
    expect(screen.getAllByText('时间待定').length).toBeGreaterThan(0)
    expect(screen.getAllByText('invalid-date').length).toBeGreaterThan(0)

    let drawer = await openLesson(user, '无时间课堂')
    expect(drawer).toHaveTextContent('课时状态 -')
    fireEvent.change(within(drawer).getByLabelText('学员student_sparse出勤'), { target: { value: 'scheduled' } })
    fireEvent.change(within(drawer).getByLabelText('教师teacher_1实际状态'), { target: { value: 'pending' } })
    await user.click(within(drawer).getByRole('button', { name: '调整时间' }))
    let dialog = screen.getByRole('dialog', { name: '调整课堂时间' })
    expect(within(dialog).getByLabelText('新开始时间')).toHaveValue('')
    expect(within(dialog).getByLabelText('新结束时间')).toHaveValue('')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))

    drawer = await openLesson(user, '无时间课堂')
    await user.click(within(drawer).getByRole('button', { name: '核销预览' }))
    dialog = await screen.findByRole('dialog', { name: '课堂核销预览' })
    expect(dialog).toHaveTextContent('学员变动0')
    expect(dialog).toHaveTextContent('教师工作量0')
    expect(dialog).toHaveTextContent('异常0')
    await user.click(within(dialog).getByRole('button', { name: '返回检查' }))

    await user.click(screen.getByRole('button', { name: '新增课堂' }))
    dialog = screen.getByRole('dialog', { name: '新增课堂' })
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', 'lessons', expect.objectContaining({ startAt: '', endAt: '', status: 'draft' })))
    view.unmount()

    const teacherApi = createMockOpsApi()
    const assigned = {
      id: 'assigned_sparse', code: 'ASSIGNED', title: '双教师课堂', startAt: '', endAt: '', location: '', status: 'scheduled',
      rosterVersion: 1, students: [], teachers: [
        { id: 'own_teacher', teacherId: 'teacher_1', role: 'lead', actualStatus: 'pending' },
        { id: 'other_teacher', teacherId: 'teacher_2', role: 'assistant', actualStatus: 'pending' },
      ],
    }
    teacherApi.listCourseResource = async <T extends CourseRecord = CourseRecord>(_token: string, resource: CourseResourceKey, query: CourseQuery = {}) => resource === 'assignedLessons'
      ? page<T>(query.sessionId ? [assigned] : [assigned])
      : page<T>([])
    const teacherOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher' as const] }
    render(<MemoryRouter><LessonsWorkspace api={teacherApi} profile={teacherOnly} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '课堂详情' }))[0])
    drawer = await screen.findByRole('dialog', { name: '双教师课堂' })
    expect(within(drawer).getByLabelText('教师teacher_1实际状态')).not.toBeDisabled()
    expect(within(drawer).getByLabelText('教师teacher_2实际状态')).toBeDisabled()
  })
})

function renderLessons(api: OpsApi) {
  return render(<MemoryRouter><LessonsWorkspace api={api} profile={mockProfiles.admin} token="token" /></MemoryRouter>)
}

function fillLesson(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('课堂名称'), { target: { value: '新课堂' } })
  fireEvent.change(within(dialog).getByLabelText('课堂编码'), { target: { value: 'LESSON-NEW' } })
  fireEvent.change(within(dialog).getByLabelText('开始时间'), { target: { value: '2026-10-01T10:00' } })
  fireEvent.change(within(dialog).getByLabelText('结束时间'), { target: { value: '2026-10-01T11:00' } })
  fireEvent.change(within(dialog).getByLabelText('地点'), { target: { value: '三号教室' } })
  fireEvent.change(within(dialog).getByLabelText('课程课时类型编号'), { target: { value: 'credit_voice' } })
}

async function openLesson(user: ReturnType<typeof userEvent.setup>, title: string) {
  const row = screen.getAllByText(title).map((element) => element.closest('tr')).find(Boolean)
  if (!row) throw new Error(`课堂 ${title} 不在桌面表格中`)
  await user.click(within(row).getByRole('button', { name: '课堂详情' }))
  return screen.findByRole('dialog', { name: title })
}

function page<T extends CourseRecord>(items: CourseRecord[]): CoursePage<T> {
  return { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
}
