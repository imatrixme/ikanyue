import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CoursePage, CourseQuery, CourseRecord, CourseResourceKey, TeachingClass } from '../../app/courseTypes'
import { ClassesWorkspace } from './ClassesWorkspace'
import { CourseResourceWorkspace } from './CourseResourceWorkspace'

const columns = [
  { key: 'name', label: '名称' },
  { key: 'durationMinutes', label: '时长' },
  { key: 'metadata', label: '扩展信息' },
  { key: 'empty', label: '空字符串' },
  { key: 'nil', label: '空对象' },
  { key: 'missing', label: '自定义', render: (record: CourseRecord) => `自定义 ${record.code}` },
]

const fields = [
  { key: 'name', label: '名称', required: true },
  { key: 'durationMinutes', label: '时长', type: 'number' as const },
  { key: 'deliveryMode', label: '形式', type: 'select' as const, options: [{ label: '班课', value: 'group' }, { label: '一对一', value: 'one_to_one' }] },
  { key: 'startAt', label: '开始日期', type: 'date' as const },
]

describe('course CRUD workspaces', () => {
  it('covers generic resource details, mobile actions, editing, creation, and status changes', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const update = vi.spyOn(api, 'updateCourseResource')
    const create = vi.spyOn(api, 'createCourseResource')
    const status = vi.spyOn(api, 'setCourseResourceStatus')
    const changed = vi.fn()
    const view = renderResource(api, changed)

    expect(await screen.findByRole('heading', { name: '课程资源测试' })).toBeInTheDocument()
    expect(await screen.findByRole('table')).toHaveTextContent('综合声乐班')

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0])
    expect(screen.getByRole('dialog', { name: /综合声乐班.*课程规格/ })).toHaveTextContent('自定义 VOCAL-GROUP')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getAllByRole('button', { name: '详情' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    await user.selectOptions(screen.getByLabelText('变更综合声乐班状态'), 'inactive')
    expect(screen.getByRole('dialog', { name: '变更课程规格状态' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.selectOptions(screen.getByLabelText('变更综合声乐班状态'), 'inactive')
    await user.click(screen.getByRole('button', { name: '确认变更' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('token', 'course-specs', 'course_1', 'inactive', 'admin_status_change'))

    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])
    let dialog = screen.getByRole('dialog', { name: '编辑课程规格' })
    await user.clear(within(dialog).getByLabelText('名称'))
    await user.type(within(dialog).getByLabelText('名称'), '编辑后的声乐课')
    await user.clear(within(dialog).getByLabelText('时长'))
    await user.type(within(dialog).getByLabelText('时长'), '75')
    await user.selectOptions(within(dialog).getByLabelText('形式'), 'one_to_one')
    await user.type(within(dialog).getByLabelText('开始日期'), '2026-09-01')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('token', 'course-specs', 'course_1', expect.objectContaining({ durationMinutes: 75, deliveryMode: 'one_to_one', name: '编辑后的声乐课' })))

    await user.click(screen.getAllByRole('button', { name: '新增课程规格' }).at(-1)!)
    dialog = screen.getByRole('dialog', { name: '新增课程规格' })
    await user.type(within(dialog).getByLabelText('名称'), '新课程')
    await user.type(within(dialog).getByLabelText('时长'), '45')
    await user.selectOptions(within(dialog).getByLabelText('形式'), 'group')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', 'course-specs', expect.objectContaining({ name: '新课程', durationMinutes: 45 })))
    expect(changed).toHaveBeenCalledTimes(3)

    await user.click(screen.getAllByRole('button', { name: '编辑' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: '取消' }))

    status.mockRejectedValueOnce(new Error('status failed'))
    await user.selectOptions(screen.getByLabelText('变更编辑后的声乐课状态'), 'active')
    await user.click(screen.getByRole('button', { name: '确认变更' }))
    expect(await screen.findByText('status failed')).toBeInTheDocument()
    view.unmount()

    const fallbackApi = createMockOpsApi()
    replaceResource(fallbackApi, 'courseSpecs', [
      { id: 'by_title', title: '仅标题', code: '', status: '', metadata: { level: 1 }, empty: '', nil: null },
      { id: 'by_operation', operationNo: 'OP-001', status: 'scheduled' },
      { id: 'by_student', studentId: 'student_fallback', status: 'inactive' },
      { id: 'by_id' },
    ])
    const readOnly = render(<CourseResourceWorkspace api={fallbackApi} columns={columns} description="只读说明" eyebrow="只读" noun="课程规格" resource="courseSpecs" title="只读课程资源" token="token" />)
    expect(await screen.findByRole('heading', { name: '只读课程资源' })).toBeInTheDocument()
    expect(await screen.findByRole('table')).toHaveTextContent('{"level":1}')
    expect(screen.getAllByText('仅标题').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OP-001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('student_fallback').length).toBeGreaterThan(0)
    expect(screen.getAllByText('by_id').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '新增课程规格' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    readOnly.unmount()
  })

  it('covers resource empty and failure recovery paths', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    replaceResource(api, 'courseSpecs', [])
    const view = renderResource(api)
    expect(await screen.findByText('还没有课程规格')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '新增课程规格' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: '取消' }))
    view.unmount()

    const failingApi = createMockOpsApi()
    vi.spyOn(failingApi, 'listCourseResource').mockRejectedValueOnce('offline')
    renderResource(failingApi)
    expect(await screen.findByText('加载课程规格失败')).toBeInTheDocument()
    vi.spyOn(failingApi, 'createCourseResource').mockRejectedValueOnce('save offline')
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')
    await user.click(screen.getAllByRole('button', { name: '新增课程规格' })[0])
    const dialog = screen.getByRole('dialog', { name: '新增课程规格' })
    await user.type(within(dialog).getByLabelText('名称'), '失败课程')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存课程规格失败')).toBeInTheDocument()
  })

  it('covers class create, edit, membership, transfer, teacher, and mobile actions', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const second: TeachingClass = { id: 'class_2', code: 'GROUP-B', name: '周日声乐班', courseSpecId: 'course_1', defaultCreditTypeId: 'credit_voice', termStart: '2026-09-01', termEnd: '2027-02-28', capacity: 8, location: '', status: 'draft' }
    appendResource(api, 'classes', second)
    const create = vi.spyOn(api, 'createCourseResource')
    const update = vi.spyOn(api, 'updateCourseResource')
    const membership = vi.spyOn(api, 'setClassMembership')
    const transfer = vi.spyOn(api, 'transferClassStudent')
    const teacher = vi.spyOn(api, 'setClassTeacher')
    render(<MemoryRouter><ClassesWorkspace api={api} token="token" /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: '班级管理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增班级' }))
    let dialog = screen.getByRole('dialog', { name: '新增班级' })
    await fillClass(user, dialog, '新建班级', 'GROUP-C')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', 'classes', expect.objectContaining({ name: '新建班级', capacity: 10 })))

    await user.click(screen.getAllByRole('button', { name: '编辑班级' })[1])
    dialog = screen.getByRole('dialog', { name: '编辑班级' })
    await user.clear(within(dialog).getByLabelText('班级名称'))
    await user.type(within(dialog).getByLabelText('班级名称'), '更新班级')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('token', 'classes', 'class_1', expect.objectContaining({ name: '更新班级' })))

    await user.click(screen.getAllByRole('button', { name: '班级详情' })[1])
    const drawer = await screen.findByRole('dialog', { name: '更新班级' })
    await user.selectOptions(within(drawer).getAllByRole('combobox')[0], 'student_2')
    await user.click(within(drawer).getByRole('button', { name: '加入' }))
    await waitFor(() => expect(membership).toHaveBeenCalledWith('token', 'class_1', 'student_2', 'active'))
    await user.selectOptions(within(drawer).getAllByLabelText('转入班级')[0], 'class_2')
    await waitFor(() => expect(transfer).toHaveBeenCalledWith('token', 'class_1', 'student_1', 'class_2'))
    await user.click(within(drawer).getAllByRole('button', { name: '移除' })[0])
    await waitFor(() => expect(membership).toHaveBeenCalledWith('token', 'class_1', 'student_2', 'cancelled'))
    await user.type(within(drawer).getByLabelText('教师编号'), 'teacher_2')
    await user.selectOptions(within(drawer).getAllByRole('combobox').at(-1)!, 'assistant')
    await user.click(within(drawer).getByRole('button', { name: '分配' }))
    await waitFor(() => expect(teacher).toHaveBeenCalledWith('token', 'class_1', 'teacher_2', 'assistant', 'active'))
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))

    await user.click(screen.getAllByRole('button', { name: '详情' }).at(-1)!)
    expect(await screen.findByRole('dialog', { name: '周日声乐班' })).toHaveTextContent('暂无关联课堂')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getAllByRole('button', { name: '编辑' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: '取消' }))
  })

  it('covers class load, detail, save, and sparse relation fallbacks', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    await api.updateCourseResource('token', 'classes', 'class_1', { location: '' })
    const originalList = api.listCourseResource.bind(api)
    api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}) => {
      if (resource === 'classStudents') return page<T>([{ id: 'member_sparse', classId: 'class_1', studentId: 'student_sparse', status: '' }])
      if (resource === 'classTeachers') return page<T>([{ id: 'teacher_sparse', classId: 'class_1', teacherId: 'teacher_sparse', role: '', status: '' }])
      if (resource === 'sessionClasses') return page<T>([{ id: 'link_sparse', classId: 'class_1', sessionId: 'lesson_sparse' }, { id: 'link_empty', classId: 'class_1', sessionId: 'lesson_empty' }])
      return originalList<T>(token, resource, query)
    }
    const originalGet = api.getCourseResource.bind(api)
    api.getCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, id: string) => {
      if (id === 'lesson_sparse') return { id, code: 'CODE-ONLY', title: '', startAt: 'invalid-date', status: '' } as unknown as T
      if (id === 'lesson_empty') return { id, code: 'EMPTY-TIME', title: '', startAt: '', status: '' } as unknown as T
      return originalGet<T>(token, resource, id)
    }
    render(<MemoryRouter><ClassesWorkspace api={api} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '班级详情' }))[0])
    let drawer = await screen.findByRole('dialog', { name: '周六综合声乐班' })
    expect(drawer).toHaveTextContent('地点待定')
    expect(drawer).toHaveTextContent('CODE-ONLY · invalid-date')
    expect(drawer).toHaveTextContent('EMPTY-TIME · 时间待定')
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))

    const detailSpy = vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce(new Error('class detail failed'))
    await user.click(screen.getAllByRole('button', { name: '班级详情' })[0])
    expect(await screen.findByText('class detail failed')).toBeInTheDocument()
    drawer = screen.getByRole('dialog', { name: '周六综合声乐班' })
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    detailSpy.mockRestore()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'createCourseResource').mockRejectedValueOnce('save offline')
    await user.click(screen.getByRole('button', { name: '新增班级' }))
    const dialog = screen.getByRole('dialog', { name: '新增班级' })
    await fillClass(user, dialog, '失败班级', 'FAIL-CLASS')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存班级失败')).toBeInTheDocument()
  })
})

function renderResource(api: OpsApi, onChanged?: () => void) {
  return render(<CourseResourceWorkspace api={api} columns={columns} defaultValues={{ status: 'draft', deliveryMode: 'group' }} description="覆盖资源工作区交互" eyebrow="课程配置" fields={fields} noun="课程规格" onChanged={onChanged} resource="courseSpecs" statusOptions={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} title="课程资源测试" token="token" writableResource="course-specs" />)
}

async function fillClass(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string, code: string) {
  await user.type(within(dialog).getByLabelText('班级名称'), name)
  await user.type(within(dialog).getByLabelText('班级编码'), code)
  await user.type(within(dialog).getByLabelText('课程规格编号'), 'course_1')
  await user.type(within(dialog).getByLabelText('默认课时类型编号'), 'credit_voice')
  await user.type(within(dialog).getByLabelText('学期开始'), '2026-09-01')
  await user.type(within(dialog).getByLabelText('学期结束'), '2027-02-28')
  await user.clear(within(dialog).getByLabelText('容量'))
  await user.type(within(dialog).getByLabelText('容量'), '10')
  await user.type(within(dialog).getByLabelText('地点'), '二号教室')
}

function replaceResource(api: OpsApi, resourceKey: CourseResourceKey, items: CourseRecord[]) {
  const original = api.listCourseResource.bind(api)
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query = {}): Promise<CoursePage<T>> => {
    if (resource !== resourceKey) return original<T>(token, resource, query)
    const page = await original<T>(token, resource, query)
    return { ...page, items: structuredClone(items) as T[], totalItems: items.length, totalPages: items.length ? 1 : 0 }
  }
}

function appendResource(api: OpsApi, resource: CourseResourceKey, item: CourseRecord) {
  const original = api.listCourseResource.bind(api)
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, requested: CourseResourceKey, query = {}): Promise<CoursePage<T>> => {
    const page = await original<T>(token, requested, query)
    return requested === resource ? { ...page, items: [...page.items, structuredClone(item) as T], totalItems: page.totalItems + 1 } : page
  }
}

function page<T extends CourseRecord>(items: CourseRecord[]): CoursePage<T> {
  return { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
}
