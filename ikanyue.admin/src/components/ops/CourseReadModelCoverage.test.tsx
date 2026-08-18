import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CoursePage, CourseQuery, CourseRecord, CourseResourceKey } from '../../app/courseTypes'
import { mockProfiles } from '../../app/mockData'
import type { OpsProfile, StudentRecord } from '../../app/types'
import { DashboardWorkspace } from './DashboardWorkspace'
import { AccountsWorkspace, ExceptionsWorkspace } from './ReadOnlyCourseWorkspaces'
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
    ])
    render(<ExceptionsWorkspace api={api} token="token" />)

    expect(await screen.findByRole('table')).toHaveTextContent('课时不足')
    expect(screen.getByRole('table')).toHaveTextContent('过期释放')
    expect(screen.getByRole('table')).toHaveTextContent('重复写入')
    expect(screen.getByRole('table')).toHaveTextContent('操作失败')
    expect(screen.getByRole('table')).toHaveTextContent('等待更正')
  })

  it('covers dashboard capability combinations, populated queues, and navigation callbacks', async () => {
    const user = userEvent.setup()
    const api = populatedDashboardApi()
    const view = renderDashboard(api, mockProfiles.admin)
    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(await screen.findByText('8 个异常')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: '进入处理' })) await user.click(button)
    await user.click(screen.getByRole('button', { name: '刷新今日工作台' }))
    await screen.findByText('8 个异常')
    view.unmount()

    const profiles: OpsProfile[] = [
      { ...mockProfiles.teacher, courseCreditCapabilities: [] },
      { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.finance'] },
      { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.academic'] },
      { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.settlement'] },
      { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.audit'] },
    ]
    for (const profile of profiles) {
      const profileView = renderDashboard(createMockOpsApi(), profile)
      await screen.findByRole('heading', { name: '今日工作台' })
      profileView.unmount()
    }
  })

  it('covers dashboard Error and non-Error fallbacks', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce(new Error('dashboard failed'))
    const view = renderDashboard(api, mockProfiles.admin)
    expect(await screen.findByText('dashboard failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect((await screen.findAllByRole('button', { name: '进入处理' })).length).toBeGreaterThan(0)
    view.unmount()

    const fallbackApi = createMockOpsApi()
    vi.spyOn(fallbackApi, 'listCourseResource').mockRejectedValueOnce('offline')
    renderDashboard(fallbackApi, mockProfiles.admin)
    expect(await screen.findByText('加载运营工作台失败')).toBeInTheDocument()
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
    await user.click((await screen.findAllByRole('button', { name: '查看课时账户明细' }))[0])
    let drawer = screen.getByRole('dialog', { name: '课时账户明细' })
    expect(drawer).toHaveTextContent('综合声乐')
    expect(drawer).toHaveTextContent('credit_voice')
    expect(drawer).toHaveTextContent('batch_id')
    expect(drawer).toHaveTextContent('长期有效')
    expect(drawer).toHaveTextContent('不可变流水')
    expect(drawer).toHaveTextContent('管理员报课')
    expect(drawer).toHaveTextContent('operation_2')
    await user.click(within(drawer).getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getAllByRole('button', { name: /学员 student_1/ }).at(-1)!)
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
    await user.click((await screen.findAllByRole('button', { name: '查看课时账户明细' }))[0])
    expect(await screen.findByText('account detail failed')).toBeInTheDocument()
  })

  it('covers student operation errors, inactive cleanup, and mobile callbacks', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    vi.spyOn(api, 'getCourseResource').mockRejectedValueOnce('offline')
    const view = renderStudentWorkspace(api)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课程与班级' }))[0])
    expect(await screen.findByText('加载学员课程详情失败')).toBeInTheDocument()
    view.unmount()

    let resolveAccount: ((value: CourseRecord) => void) | undefined
    const deferredApi = createMockOpsApi()
    vi.spyOn(deferredApi, 'getCourseResource').mockImplementationOnce(() => new Promise((resolve) => { resolveAccount = resolve }))
    const deferredView = renderStudentWorkspace(deferredApi)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课程与班级' }))[0])
    deferredView.unmount()
    resolveAccount?.({ id: 'student_1', studentId: 'student_1', availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0 })
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const onOpen = vi.fn()
    const mobileView = render(<StudentsPanel loading={false} onOpenOperations={onOpen} onReload={vi.fn()} onSave={vi.fn().mockResolvedValue(true)} students={[student]} />)
    await user.click(screen.getByRole('button', { name: '课程与班级' }))
    expect(onOpen).toHaveBeenCalledWith(student)
    await user.click(screen.getAllByRole('button', { name: '编辑张同学' }).at(-1)!)
    expect(screen.getByRole('dialog', { name: '编辑张同学' })).toBeInTheDocument()
    mobileView.unmount()
  })

  it('covers sparse teacher relationships and student operation value fallbacks', async () => {
    const user = userEvent.setup()
    const teacherOnly = { ...mockProfiles.teacher, courseCreditCapabilities: ['course_credit.teacher' as const] }
    const sparseTeacher: StudentRecord = { ...student, realName: '', nickName: '只有昵称', classAssignments: undefined, lessonAssignments: undefined }
    const emptyView = render(<MemoryRouter><StudentWorkspace api={createMockOpsApi()} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={teacherOnly} students={[sparseTeacher]} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '查看只有昵称课程与班级' }))[0])
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
    const relationView = render(<MemoryRouter><StudentWorkspace api={createMockOpsApi()} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={teacherOnly} students={[relationStudent]} token="token" /></MemoryRouter>)
    await user.click((await screen.findAllByRole('button', { name: '查看13900009999课程与班级' }))[0])
    drawer = screen.getByRole('dialog', { name: /授课关系/ })
    expect(drawer).toHaveTextContent('class_1 · active')
    expect(drawer).toHaveTextContent('lesson_1 · 待上课')
    relationView.unmount()

    const api = createMockOpsApi()
    const originalList = api.listCourseResource.bind(api)
    api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}) => {
      if (resource === 'classStudents') return coursePage<T>([{ id: 'class_blank', classId: 'class_1', status: '' }])
      if (resource === 'sessionStudents') return coursePage<T>([{ id: 'lesson_blank', sessionId: 'lesson_1', attendanceStatus: '', creditStatus: '' }])
      if (resource === 'enrollments') return coursePage<T>([{ id: 'enroll_blank', operationNo: 'ENR-BLANK', status: 'committed', resultSnapshot: { status: '' } }])
      if (resource === 'auditLogs') return coursePage<T>([{ id: 'audit_blank', action: 'student.inspect', outcome: '' }])
      return originalList<T>(token, resource, query)
    }
    const adminView = renderStudentWorkspace(api)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课程与班级' }))[0])
    drawer = await screen.findByRole('dialog', { name: '张同学 · 课程与班级' })
    expect(drawer).toHaveTextContent('ENR-BLANK · committed')
    expect(drawer).toHaveTextContent('lesson_1 · 待上课 · -')
    expect(drawer).toHaveTextContent('student.inspect · -')
    adminView.unmount()

    const errorApi = createMockOpsApi()
    vi.spyOn(errorApi, 'getCourseResource').mockRejectedValueOnce(new Error('student detail failed'))
    renderStudentWorkspace(errorApi)
    await user.click((await screen.findAllByRole('button', { name: '查看张同学课程与班级' }))[0])
    expect(await screen.findByText('student detail failed')).toBeInTheDocument()
  })
})

function renderDashboard(api: OpsApi, profile: OpsProfile) {
  return render(<MemoryRouter><DashboardWorkspace api={api} profile={profile} token="token" /></MemoryRouter>)
}

function renderAccounts(api: OpsApi) {
  return render(<AccountsWorkspace api={api} token="token" />)
}

function renderStudentWorkspace(api: OpsApi) {
  return render(<MemoryRouter><StudentWorkspace api={api} loading={false} onReload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn().mockResolvedValue(true)} profile={mockProfiles.admin} students={[student]} token="token" /></MemoryRouter>)
}

function populatedDashboardApi() {
  const api = createMockOpsApi()
  const original = api.listCourseResource.bind(api)
  const today = new Date().toISOString().slice(0, 10)
  const records: Partial<Record<CourseResourceKey, CourseRecord[]>> = {
    lessons: [
      { id: 'today', title: '今日课堂', startAt: `${today}T10:00:00.000Z`, status: 'completed' },
      { id: 'future', title: '未来课堂', startAt: '2030-01-01T10:00:00.000Z', status: 'scheduled' },
    ],
    enrollments: [
      { id: 'sync', resultSnapshot: { status: 'synchronizing_future_lessons' } },
      { id: 'done', resultSnapshot: { status: 'completed' } },
    ],
    accounts: [
      { id: 'empty', availableQuantity: 0, expiredQuantity: 2 },
      { id: 'valid', availableQuantity: 3, expiredQuantity: 0 },
    ],
    teacherEvents: [{ id: 'pending', status: 'pending' }, { id: 'confirmed', status: 'confirmed' }],
    settlementExceptions: [{ id: 'settlement_exception' }, { id: 'settlement_exception_2' }, { id: 'settlement_exception_3' }],
    reconciliationExceptions: [{ id: 'reconciliation_exception' }, { id: 'reconciliation_exception_2' }, { id: 'reconciliation_exception_3' }, { id: 'reconciliation_exception_4' }],
  }
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query: CourseQuery = {}): Promise<CoursePage<T>> => {
    const items = records[resource]
    return items ? { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: 1 } : original<T>(token, resource, query)
  }
  return api
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
