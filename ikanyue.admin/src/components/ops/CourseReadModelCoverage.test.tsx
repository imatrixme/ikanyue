import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CoursePage, CourseQuery, CourseRecord, CourseResourceKey } from '../../app/courseTypes'
import { mockProfiles } from '../../app/mockData'
import type { OpsProfile, StudentRecord } from '../../app/types'
import { DashboardWorkspace } from './DashboardWorkspace'
import { AccountsWorkspace, ExceptionsWorkspace } from './ReadOnlyCourseWorkspaces'
import { StudentDetailPage } from './StudentDetailPage'
import { StudentsPanel } from './StudentsPanel'
import { StudentWorkspace } from './StudentWorkspace'

const student: StudentRecord = {
  id: 'student_1', realName: '张同学', nickName: '小张', cellphone: '13900139001', avatar: '', blocked: false,
  lastLoginAt: '', created: '2026-06-01T08:00:00.000Z', updated: '2026-07-01T08:00:00.000Z',
}

describe('course read model coverage', () => {
  it('shows every settlement exception class in one Admin workspace', async () => {
    const api = createMockOpsApi()
    replaceResource(api, 'settlementExceptions', [
      { id: 'one', kind: 'credit_insufficient', status: 'open', reason: '余额不足' },
      { id: 'two', kind: 'expired_release', status: 'open', reason: '释放时过期' },
      { id: 'three', kind: 'duplicate', status: 'acknowledged', reason: 'DUPLICATE_EVENT' },
      { id: 'four', kind: 'failed_operation', status: 'failed', reason: '写入失败' },
      { id: 'five', kind: 'correction_pending', status: 'correction_pending', reason: '等待更正' },
      { id: 'six', kind: 'custom_kind', status: 'custom_status', reason: '需要人工确认' },
      { id: 'seven', kind: '', status: '', reason: '' },
    ])
    render(<ExceptionsWorkspace api={api} token="token" />)

    expect(await screen.findByRole('table')).toHaveTextContent('课时不足')
    expect(screen.getByRole('table')).toHaveTextContent('过期释放')
    expect(screen.getByRole('table')).toHaveTextContent('重复写入')
    expect(screen.getByRole('table')).toHaveTextContent('操作失败')
    expect(screen.getByRole('table')).toHaveTextContent('等待更正')
    expect(screen.getByRole('table')).toHaveTextContent('custom_kind')
    expect(screen.getByRole('table')).toHaveTextContent('custom_status')
  })

  it('lists today tasks by capability and opens the exact record', async () => {
    const user = userEvent.setup()
    const api = populatedDashboardApi()
    const view = renderDashboard(api, mockProfiles.admin)
    expect(await screen.findByRole('heading', { name: /^今天/ })).toBeInTheDocument()
    const lessons = await screen.findByRole('region', { name: '今日课堂' })
    expect(lessons).toHaveTextContent('晨间合唱')
    expect(lessons).toHaveTextContent('07:30')
    expect(lessons).not.toHaveTextContent('未来课堂')
    expect(screen.getByRole('region', { name: '待核销课堂' })).toHaveTextContent('待核销')
    const renewal = screen.getByRole('region', { name: '需要续课（剩余 ≤ 2 课时）' })
    expect(renewal).toHaveTextContent('张同学')
    expect(renewal).toHaveTextContent('已过期 2 课时')
    expect(renewal).not.toHaveTextContent('student_2')
    expect(renewal).not.toHaveTextContent('student_never')
    expect(screen.getByRole('region', { name: '报课后待同步名单' })).toHaveTextContent('待同步')
    expect(screen.getByRole('region', { name: '异常' })).toHaveTextContent('7 条核销或对账异常')
    expect(screen.getByRole('region', { name: '待确认工作量' })).toHaveTextContent('1 条授课工作量待确认')
    await user.click(within(lessons).getByRole('button', { name: /晨间合唱/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/schedule/lessons?sessionId=today')
    await user.click(within(renewal).getByRole('button', { name: /剩 0 课时/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/students/student_1')
    await user.click(screen.getByRole('button', { name: '刷新今日待办' }))
    await screen.findByRole('region', { name: '今日课堂' })
    view.unmount()

    const empty = renderDashboard(createMockOpsApi(), { ...mockProfiles.teacher, courseCreditCapabilities: [] })
    expect(await screen.findByText('今天没有待办')).toBeInTheDocument()
    empty.unmount()

    const teacherApi = createMockOpsApi()
    const list = vi.spyOn(teacherApi, 'listCourseResource')
    const teacherView = renderDashboard(teacherApi, { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher'] })
    await screen.findByRole('heading', { name: /^今天/ })
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(list.mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining(['assignedLessons', 'teacherEvents']))
    expect(list.mock.calls.map((call) => call[1])).not.toEqual(expect.arrayContaining(['accounts']))
    teacherView.unmount()

    for (const capability of ['course_credit.finance', 'course_credit.academic', 'course_credit.settlement', 'course_credit.audit'] as const) {
      const profileView = renderDashboard(createMockOpsApi(), { ...mockProfiles.teacher, courseCreditCapabilities: [capability] })
      await screen.findByRole('heading', { name: /^今天/ })
      profileView.unmount()
    }
  })

  it('marks a lesson present and snoozes a renewal from today', async () => {
    const user = userEvent.setup()
    const api = populatedDashboardApi()
    const mark = vi.spyOn(api, 'markAllPresent')
    const record = vi.spyOn(api, 'recordFollowUp')
    renderDashboard(api, mockProfiles.admin)
    const lessons = await screen.findByRole('region', { name: '今日课堂' })
    expect(within(lessons).queryByRole('button', { name: '晨间合唱全部到课' })).not.toBeInTheDocument()
    await user.click(within(lessons).getByRole('button', { name: '午间练声全部到课' }))
    expect(mark).toHaveBeenCalledWith('token', 'today_open')
    expect(await within(lessons).findByRole('button', { name: '午间练声已全部到课' })).toBeDisabled()

    await user.click(within(screen.getByRole('region', { name: /需要续课/ })).getByRole('button', { name: '张同学记录跟进' }))
    const dialog = screen.getByRole('dialog', { name: '记录续课跟进' })
    await user.type(within(dialog).getByRole('textbox', { name: '备注' }), '下周回复')
    await user.click(within(dialog).getByRole('button', { name: '保存跟进' }))
    expect(record).toHaveBeenCalledWith('token', 'student_1', expect.objectContaining({ status: 'contacted', note: '下周回复' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: /需要续课/ })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '刷新今日待办' }))
    await screen.findByRole('region', { name: '今日课堂' })
    expect(screen.queryByRole('region', { name: /需要续课/ })).not.toBeInTheDocument()
  })

  it('covers today Error and non-Error fallbacks', async () => {
    const user = userEvent.setup()
    const api = populatedDashboardApi()
    vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce(new Error('dashboard failed'))
    const view = renderDashboard(api, mockProfiles.admin)
    expect(await screen.findByText('dashboard failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('region', { name: '今日课堂' })).toBeInTheDocument()
    view.unmount()

    const fallbackApi = createMockOpsApi()
    vi.spyOn(fallbackApi, 'listCourseResource').mockRejectedValueOnce('offline')
    renderDashboard(fallbackApi, mockProfiles.admin)
    expect(await screen.findByText('加载今日待办失败')).toBeInTheDocument()
  })

  it('covers account batches, mobile detail, empty state, and load/detail errors', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'getCourseResource').mockResolvedValue({
      id: 'student_1', studentId: 'student_1', availableQuantity: 8, frozenQuantity: 1, consumedQuantity: 1,
      expiredQuantity: 2, unactivatedQuantity: 0, batchCount: 3,
      batches: [
        { id: 'batch_name', creditTypeName: '综合声乐', availableQuantity: 3, effectiveExpiresAt: '2027-01-01' },
        { id: 'batch_type', creditTypeId: 'credit_voice', availableQuantity: 2, effectiveExpiresAt: '' },
        { id: 'batch_id', availableQuantity: null, effectiveExpiresAt: '' },
      ],
      events: [
        { id: 'event_1', eventType: 'GRANT', quantityDelta: 10, reason: '管理员报课' },
        { id: 'event_2', eventType: 'CONSUME', quantityDelta: -1, operationId: 'operation_2' },
      ],
    })
    const view = renderAccounts(api)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课时账户' }))[0])
    let drawer = screen.getByRole('dialog', { name: '课时账户明细' })
    expect(drawer).toHaveTextContent('综合声乐')
    expect(drawer).toHaveTextContent('credit_voice')
    expect(drawer).toHaveTextContent('batch_id')
    expect(drawer).toHaveTextContent('长期有效')
    expect(drawer).toHaveTextContent('课时变动记录')
    expect(drawer).toHaveTextContent('管理员报课')
    expect(drawer).toHaveTextContent('operation_2')
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getByRole('button', { name: /^张同学13900139001/ }))
    drawer = await screen.findByRole('dialog', { name: '课时账户明细' })
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    view.unmount()

    const emptyApi = createMockOpsApi()
    replaceResource(emptyApi, 'accounts', [])
    const emptyView = renderAccounts(emptyApi)
    expect(await screen.findByText('还没有课时账户')).toBeInTheDocument()
    emptyView.unmount()

    const loadApi = createMockOpsApi()
    vi.spyOn(loadApi, 'listCourseResource').mockRejectedValueOnce('offline')
    const loadView = renderAccounts(loadApi)
    expect(await screen.findByText('加载课时账户失败')).toBeInTheDocument()
    loadView.unmount()

    const detailApi = createMockOpsApi()
    vi.spyOn(detailApi, 'getCourseResource').mockRejectedValueOnce(new Error('account detail failed'))
    renderAccounts(detailApi)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课时账户' }))[0])
    expect(await screen.findByText('account detail failed')).toBeInTheDocument()
  })

  it('opens the student detail page from the list and keeps teachers in a drawer', async () => {
    const user = userEvent.setup()
    renderStudentWorkspace(createMockOpsApi())
    await user.click((await screen.findAllByRole('button', { name: '查看张同学学员详情' }))[0])
    expect(screen.getByTestId('location')).toHaveTextContent('/students/student_1')

    const onOpen = vi.fn()
    const mobileView = render(<StudentsPanel loading={false} onOpenOperations={onOpen} onReload={vi.fn()} onSave={vi.fn().mockResolvedValue(true)} students={[student]} />, { wrapper: MemoryRouter })
    await user.click(screen.getAllByRole('button', { name: '详情' }).at(-1)!)
    expect(onOpen).toHaveBeenCalledWith(student)
    await user.click(screen.getAllByRole('button', { name: '编辑张同学' }).at(-1)!)
    expect(screen.getByRole('dialog', { name: '编辑张同学' })).toBeInTheDocument()
    mobileView.unmount()
  })

  it('shows balance, upcoming lessons, enrollments and history on the student page', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const soon = new Date(Date.now() + 86_400_000).toISOString()
    const originalList = api.listCourseResource.bind(api)
    api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}) => {
      if (resource === 'lessons') return coursePage<T>([{ id: 'lesson_next', title: '下周声乐课', startAt: soon, status: 'scheduled' }, { id: 'lesson_old', title: '上次合唱', startAt: '2026-01-05T10:00:00.000Z', status: 'settled' }])
      if (resource === 'classStudents') return coursePage<T>([{ id: 'class_blank', classId: 'class_1', status: '' }])
      if (resource === 'sessionStudents') return coursePage<T>([{ id: 's_next', sessionId: 'lesson_next', attendanceStatus: '' }, { id: 's_old', sessionId: 'lesson_old', attendanceStatus: 'present', creditStatus: '' }, { id: 's_missing', sessionId: 'lesson_gone', attendanceStatus: '' }])
      if (resource === 'enrollments') return coursePage<T>([{ id: 'enroll_blank', operationNo: 'ENR-BLANK', status: 'committed', resultSnapshot: { status: '' } }])
      if (resource === 'auditLogs') return coursePage<T>([{ id: 'audit_blank', action: 'student.inspect', outcome: '' }])
      return originalList<T>(token, resource, query)
    }
    vi.spyOn(api, 'listManagedStudents').mockResolvedValue({ items: [{ ...student, blocked: true }], pagination: { page: 1, perPage: 100, totalItems: 1, totalPages: 1 } })
    renderStudentPage(api)
    expect(await screen.findByRole('heading', { name: '张同学' })).toBeInTheDocument()
    expect(screen.getByText(/账号已停用/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '即将上课' })).toHaveTextContent('下周声乐课')
    expect(screen.getByRole('region', { name: '即将上课' })).not.toHaveTextContent('上次合唱')
    expect(screen.getByRole('region', { name: '最近课堂' })).toHaveTextContent('上次合唱')
    expect(screen.getByRole('region', { name: '最近课堂' })).toHaveTextContent('到课')
    expect(screen.getByRole('region', { name: '最近课堂' })).toHaveTextContent('未找到课堂')
    expect(screen.getByRole('region', { name: '报课记录' })).toHaveTextContent('课包信息缺失')
    expect(screen.getByRole('region', { name: '最近操作' })).toHaveTextContent('student.inspect')
    await user.click(screen.getByRole('button', { name: '报课/续课' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/billing/enrollments?new=1&studentId=student_1')
  })

  it('reports student page load failures', async () => {
    const api = createMockOpsApi()
    vi.spyOn(api, 'getCourseResource').mockRejectedValueOnce(new Error('student detail failed'))
    const view = renderStudentPage(api)
    expect(await screen.findByText('student detail failed')).toBeInTheDocument()
    view.unmount()

    const fallbackApi = createMockOpsApi()
    vi.spyOn(fallbackApi, 'getCourseResource').mockRejectedValueOnce('offline')
    renderStudentPage(fallbackApi)
    expect(await screen.findByText('加载学员详情失败')).toBeInTheDocument()
  })

  it('covers sparse teacher relationships in the assigned-student drawer', async () => {
    const user = userEvent.setup()
    const teacherOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher' as const] }
    const sparseTeacher: StudentRecord = { ...student, realName: '', nickName: '只有昵称', classAssignments: undefined, lessonAssignments: undefined }
    const emptyView = render(<MemoryRouter><StudentWorkspace api={createMockOpsApi()} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={teacherOnly} students={[sparseTeacher]} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '查看只有昵称学员详情' }))[0])
    let drawer = screen.getByRole('dialog', { name: '只有昵称 · 授课关系' })
    expect(drawer).toHaveTextContent('暂无负责班级关系')
    expect(drawer).toHaveTextContent('暂无负责课堂记录')
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    emptyView.unmount()

    const relationStudent: StudentRecord = {
      ...student, realName: '', nickName: '', cellphone: '13900009999',
      classAssignments: [{ id: 'class_sparse', classId: 'class_1', studentId: 'student_1', status: '' }],
      lessonAssignments: [{ id: 'lesson_sparse', sessionId: 'lesson_1', studentId: 'student_1', attendanceStatus: '' }],
    }
    relationStudent.classAssignments?.push({ id: 'class_missing', studentId: 'student_1', status: '' })
    relationStudent.lessonAssignments?.push({ id: 'lesson_missing', studentId: 'student_1', attendanceStatus: '' })
    render(<MemoryRouter><StudentWorkspace api={createMockOpsApi()} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={teacherOnly} students={[relationStudent]} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '查看13900009999学员详情' }))[0])
    drawer = screen.getByRole('dialog', { name: /授课关系/ })
    expect(drawer).toHaveTextContent('未找到班级（class_1） · 启用')
    expect(drawer).toHaveTextContent('未找到课堂（lesson_1） · 待上课')
    expect(drawer).toHaveTextContent('班级信息缺失 · 启用')
    expect(drawer).toHaveTextContent('课堂信息缺失 · 待上课')
  })
})

function renderDashboard(api: OpsApi, profile: OpsProfile) {
  return render(<MemoryRouter initialEntries={['/today']}><DashboardWorkspace api={api} profile={profile} token="token" /><Location /></MemoryRouter>)
}

function renderStudentPage(api: OpsApi) {
  return render(<MemoryRouter initialEntries={['/students/student_1']}><StudentDetailPage api={api} studentId="student_1" token="token" /><Location /></MemoryRouter>)
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderAccounts(api: OpsApi) {
  return render(<AccountsWorkspace api={api} token="token" />)
}

function renderStudentWorkspace(api: OpsApi) {
  return render(<MemoryRouter><StudentWorkspace api={api} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={mockProfiles.admin} students={[student]} token="token" /><Location /></MemoryRouter>)
}

function populatedDashboardApi() {
  const api = createMockOpsApi()
  const original = api.listCourseResource.bind(api)
  const earlyToday = new Date()
  earlyToday.setHours(7, 30, 0, 0)
  const records: Partial<Record<CourseResourceKey, CourseRecord[]>> = {
    lessons: [
      { id: 'today', title: '晨间合唱', startAt: earlyToday.toISOString(), status: 'completed' },
      { id: 'today_open', title: '午间练声', startAt: new Date(earlyToday.getTime() + 4 * 3_600_000).toISOString(), status: 'scheduled' },
      { id: 'future', title: '未来课堂', startAt: '2030-01-01T10:00:00.000Z', status: 'scheduled' },
    ],
    enrollments: [
      { id: 'sync', resultSnapshot: { status: 'synchronizing_future_lessons' } },
      { id: 'done', resultSnapshot: { status: 'completed' } },
    ],
    accounts: [
      { id: 'empty', studentId: 'student_1', availableQuantity: 0, frozenQuantity: 0, expiredQuantity: 2 },
      { id: 'valid', studentId: 'student_2', availableQuantity: 3, frozenQuantity: 0, expiredQuantity: 0 },
      { id: 'never_bought', studentId: 'student_never', availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0 },
    ],
    teacherEvents: [{ id: 'pending', status: 'pending' }, { id: 'confirmed', status: 'confirmed' }],
    settlementExceptions: [{ id: 'settlement_exception' }, { id: 'settlement_exception_2' }, { id: 'settlement_exception_3' }],
    reconciliationExceptions: [{ id: 'reconciliation_exception' }, { id: 'reconciliation_exception_2' }, { id: 'reconciliation_exception_3' }, { id: 'reconciliation_exception_4' }],
  }
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}): Promise<CoursePage<T>> => {
    const items = records[resource]?.filter((item) => matchesDashboardQuery(item, query))
    return items ? { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: 1 } : original<T>(token, resource, query)
  }
  return api
}

function matchesDashboardQuery(item: CourseRecord, query: CourseQuery) {
  const quantity = (key: string) => Number(item[key] || 0)
  if (query.status && item.status !== query.status) return false
  if (query.from && Date.parse(String(item.startAt)) < Date.parse(query.from)) return false
  if (query.to && Date.parse(String(item.startAt)) >= Date.parse(query.to)) return false
  if (query.renewalThreshold !== undefined && !(quantity('availableQuantity') <= query.renewalThreshold && quantity('frozenQuantity') === 0 && quantity('consumedQuantity') + quantity('expiredQuantity') > 0)) return false
  return true
}

function replaceResource(api: OpsApi, resourceKey: CourseResourceKey, items: CourseRecord[]) {
  const original = api.listCourseResource.bind(api)
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}): Promise<CoursePage<T>> => resource === resourceKey
    ? { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
    : original<T>(token, resource, query)
}

function coursePage<T extends CourseRecord>(items: CourseRecord[]): CoursePage<T> {
  return { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
}
