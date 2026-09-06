import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CoursePage, CourseRecord, CourseResourceKey, EnrollmentOperation } from '../../app/courseTypes'
import { EnrollmentsWorkspace } from './EnrollmentsWorkspace'

const operations: EnrollmentOperation[] = [
  enrollment('sync', 'synchronizing_future_lessons', { orderId: '', classId: 'class_1' }),
  enrollment('awaiting', 'awaiting_class_assignment', { classId: '' }),
  enrollment('complete', 'completed'),
  enrollment('warning', 'completed_with_warnings'),
  enrollment('failed', 'failed'),
  enrollment('processing', ''),
  enrollment('custom', 'reviewing'),
]

describe('enrollment workspace coverage', () => {
  it('covers URL defaults, optional payment fields, status variants, details, and sync actions', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    replaceResource(api, 'enrollments', operations)
    const create = vi.spyOn(api, 'createEnrollment')
    const preview = vi.spyOn(api, 'previewEnrollmentSync')
    const confirm = vi.spyOn(api, 'confirmEnrollmentSync')
    renderEnrollments(api, '/enrollments?new=1&studentId=student_1&classId=class_1')

    const dialog = await screen.findByRole('dialog', { name: '管理员报课' })
    await waitFor(() => expect(within(dialog).getByLabelText('学员')).toHaveValue('张同学'))
    await waitFor(() => expect(within(dialog).getByLabelText('进入班级（可选）')).toHaveValue('周六综合声乐班'))
    await chooseReference(user, dialog, '所报课包', '综合声乐')
    await chooseReference(user, dialog, '本次售价', '2,800')
    await user.type(within(dialog).getByLabelText('实际收款金额（可选）'), '2680')
    await user.type(within(dialog).getByLabelText('支付流水号（可选）'), 'WX-20260723')
    await user.type(within(dialog).getByLabelText('报课备注'), '前台报课')
    await user.click(within(dialog).getByRole('button', { name: '确认报课' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', expect.objectContaining({ classId: 'class_1', paidAmount: 2680, paymentReference: 'WX-20260723', reason: '前台报课', studentId: 'student_1' })))

    expect((await screen.findAllByText('报课完成，有事项需确认')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('报课失败').length).toBeGreaterThan(0)
    expect(screen.getAllByText('报课处理中').length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: '查看报课详情' })[0])
    expect(screen.getByRole('dialog', { name: '报课详情' })).toHaveTextContent('等待同步未来课堂名单')
    expect(screen.getByRole('dialog', { name: '报课详情' })).toHaveTextContent('source_sync')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))
    await user.click(screen.getAllByRole('button', { name: '详情' }).at(-1)!)
    expect(screen.getByRole('dialog', { name: '报课详情' })).toHaveTextContent('报课处理中')
    await user.click(screen.getByRole('button', { name: '关闭弹窗' }))

    await user.click(screen.getAllByRole('button', { name: '同步名单' })[0])
    expect(await screen.findByRole('dialog', { name: '确认同步课堂名单' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getAllByRole('button', { name: '同步名单' }).at(-1)!)
    await user.click(await screen.findByRole('button', { name: '确认同步' }))
    await waitFor(() => expect(preview).toHaveBeenCalledWith('token', 'source_sync'))
    expect(confirm).toHaveBeenCalledWith('token', 'source_sync', 'preview-source_sync', ['lesson_1'])

    await user.click(screen.getByRole('button', { name: '新建报课' }))
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '重新加载报课列表' }))
    await screen.findByRole('table')
  })

  it('covers empty state and loading, enrollment, preview, and confirmation failures', async () => {
    const user = userEvent.setup()
    const emptyApi = createMockOpsApi()
    replaceResource(emptyApi, 'enrollments', [])
    const emptyView = renderEnrollments(emptyApi)
    expect(await screen.findByText('还没有报课记录')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '新建报课' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: '取消' }))
    emptyView.unmount()

    const api = createMockOpsApi()
    replaceResource(api, 'enrollments', operations)
    vi.spyOn(api, 'listCourseResource').mockRejectedValueOnce('offline')
    renderEnrollments(api)
    expect(await screen.findByText('加载报课数据失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'createEnrollment').mockRejectedValueOnce('enroll offline')
    await user.click(screen.getByRole('button', { name: '新建报课' }))
    let dialog = screen.getByRole('dialog', { name: '管理员报课' })
    await chooseReference(user, dialog, '学员', '张同学')
    await chooseReference(user, dialog, '所报课包', '综合声乐')
    await chooseReference(user, dialog, '本次售价', '2,800')
    await user.clear(within(dialog).getByLabelText('实际收款金额（可选）'))
    await user.click(within(dialog).getByRole('button', { name: '确认报课' }))
    expect(await screen.findByText('报课失败')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'previewEnrollmentSync').mockRejectedValueOnce(new Error('preview failed'))
    await user.click(screen.getAllByRole('button', { name: '同步名单' })[0])
    expect(await screen.findByText('preview failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByRole('table')

    vi.spyOn(api, 'confirmEnrollmentSync').mockRejectedValueOnce('confirm offline')
    await user.click(screen.getAllByRole('button', { name: '同步名单' })[0])
    dialog = await screen.findByRole('dialog', { name: '确认同步课堂名单' })
    await user.click(within(dialog).getByRole('button', { name: '确认同步' }))
    expect(await screen.findByText('同步课堂名单失败')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '确认同步课堂名单' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
  })

  it('renders stable labels for sparse student and price records', async () => {
    const api = createMockOpsApi()
    replaceResource(api, 'enrollments', operations)
    replaceResource(api, 'priceVersions', [
      { id: 'price_sparse', packageId: 'package_1', listAmount: 3000, saleAmount: null, currency: '', version: 0, status: 'active' },
    ])
    replaceResource(api, 'packages', [
      { id: 'package_1', name: '精简课包', code: '', validityDurationDays: 0, status: 'inactive' },
    ])
    replaceResource(api, 'classes', [
      { id: 'class_1', name: '临时班', code: '', termStart: '', termEnd: '', location: '', status: 'draft' },
    ])
    vi.spyOn(api, 'listManagedStudents').mockResolvedValue({
      items: [{ id: 'student_nickname', realName: '', nickName: '昵称学员', cellphone: '13800000000', avatar: '', blocked: false, created: '', updated: '', lastLoginAt: '' }],
      pagination: { page: 1, perPage: 100, totalItems: 1, totalPages: 1 },
    })

    renderEnrollments(api, '/enrollments?new=1')
    const dialog = await screen.findByRole('dialog', { name: '管理员报课' })
    await userEvent.setup().click(within(dialog).getByLabelText('学员'))
    expect(await within(dialog).findByRole('option', { name: /昵称学员.*13800000000/ })).toBeInTheDocument()
    await userEvent.setup().click(within(dialog).getByLabelText('所报课包'))
    await userEvent.setup().type(within(dialog).getByLabelText('所报课包'), '精简课包')
    expect(await within(dialog).findByRole('option', { name: /精简课包.*未启用/ })).toBeInTheDocument()
    await userEvent.setup().keyboard('{Enter}')
    await userEvent.setup().click(within(dialog).getByLabelText('本次售价'))
    expect(await within(dialog).findByRole('option', { name: /3,000/ })).toBeInTheDocument()
    await userEvent.setup().click(within(dialog).getByLabelText('进入班级（可选）'))
    expect(await within(dialog).findByRole('option', { name: /临时班/ })).toBeInTheDocument()
  })
})

function enrollment(id: string, resultStatus: string, overrides: { classId?: string; orderId?: string } = {}): EnrollmentOperation {
  return {
    id: `enrollment_${id}`,
    operationNo: `ENR-${id.toUpperCase()}`,
    studentId: 'student_1',
    sourceId: `source_${id}`,
    status: 'committed',
    actorId: id === 'processing' ? '' : 'admin_1',
    actorRole: id === 'processing' ? '' : 'admin',
    requestSnapshot: { packageId: id === 'processing' ? '' : 'package_1', classId: overrides.classId ?? 'class_1' },
    resultSnapshot: { orderId: overrides.orderId ?? `order_${id}`, status: resultStatus, sync: { futureLessonCount: id === 'processing' ? 0 : 2 } },
  }
}

async function chooseReference(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, label: string, query: string) {
  const input = within(scope).getByLabelText(label)
  await user.click(input)
  await user.type(input, query)
  await user.keyboard('{Enter}')
}

function renderEnrollments(api: OpsApi, entry = '/enrollments') {
  return render(<MemoryRouter initialEntries={[entry]}><EnrollmentsWorkspace api={api} token="token" /></MemoryRouter>)
}

function replaceResource(api: OpsApi, resourceKey: CourseResourceKey, items: CourseRecord[]) {
  const original = api.listCourseResource.bind(api)
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query = {}): Promise<CoursePage<T>> => {
    if (resource !== resourceKey) return original<T>(token, resource, query)
    return { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
  }
}
