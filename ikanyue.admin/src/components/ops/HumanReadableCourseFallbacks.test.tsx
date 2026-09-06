import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi, type OpsApi } from '../../app/api'
import type { CourseAccount, CoursePage, CourseRecord, CourseResourceKey } from '../../app/courseTypes'
import { AccountsWorkspace } from './ReadOnlyCourseWorkspaces'
import { CoursesWorkspace, PackagesWorkspace } from './CourseCatalogWorkspaces'
import { CourseResourceWorkspace } from './CourseResourceWorkspace'

describe('human-readable course fallbacks', () => {
  it('explains sparse catalog versions, rules, and reference failures', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const references = await api.getBookingReferenceData('token')
    vi.spyOn(api, 'getBookingReferenceData').mockResolvedValue({
      ...references,
      creditTypes: [{ id: 'credit-sparse', code: 'CREDIT-SPARSE', name: '零散课时', courseSpecId: 'course-1', unitLabel: '' }],
    })
    replaceResources(api, {
      packages: [{ id: 'package-inactive', name: '暂停销售课包', code: '', status: 'inactive' }],
      priceVersions: [{ id: 'price-zero', packageId: 'package-inactive', version: 0, listAmount: 0, saleAmount: 0, currency: 'CNY', validFrom: '', status: '' }],
      grantLines: [],
      conversionRules: [{ id: 'conversion-zero', sourceCreditTypeId: 'credit-sparse', targetCreditTypeId: 'credit-sparse', version: 0, sourceQuantity: 0, targetQuantity: 0, minSourceQuantity: 0, validFrom: '', status: '' }],
    })
    const view = render(<PackagesWorkspace api={api} token="token" />)

    expect((await screen.findAllByText('暂停销售课包')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: '价格与生效时间' }))
    expect(await screen.findByRole('table')).toHaveTextContent('第 1 版')
    await user.click(screen.getByRole('tab', { name: '课时兑换' }))
    expect(await screen.findByRole('table')).toHaveTextContent('零散课时')
    expect(screen.getByRole('table')).toHaveTextContent('-')
    view.unmount()

    const errorApi = createMockOpsApi()
    vi.spyOn(errorApi, 'getBookingReferenceData').mockRejectedValueOnce('offline')
    render(<CoursesWorkspace api={errorApi} token="token" />)
    await user.click((await screen.findAllByRole('button', { name: '新增课程规格' })).at(-1)!)
    const dialog = screen.getByRole('dialog', { name: '新增课程规格' })
    await user.click(within(dialog).getByLabelText('默认扣减课时'))
    expect(await within(dialog).findByText('关联数据加载失败，请重试')).toBeInTheDocument()
  })

  it('shows account identity and empty detail fallbacks when student lookup fails', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    replaceResources(api, {
      accounts: [{ id: 'account-missing', studentId: 'student-missing', availableQuantity: null, frozenQuantity: null, consumedQuantity: null, expiredQuantity: null }],
    })
    vi.spyOn(api, 'listManagedStudents').mockRejectedValueOnce('offline')
    vi.spyOn(api, 'getCourseResource').mockResolvedValue({
      id: 'account-missing', studentId: 'student-missing', availableQuantity: 0, frozenQuantity: 0, consumedQuantity: 0, expiredQuantity: 0,
    } as CourseAccount)
    render(<AccountsWorkspace api={api} token="token" />)

    const open = await screen.findByRole('button', { name: /查看未找到人员.*课时账户/ })
    expect(screen.getAllByText('联系方式待补充').length).toBeGreaterThan(0)
    await user.click(open)
    const drawer = await screen.findByRole('dialog', { name: '课时账户明细' })
    expect(drawer).toHaveTextContent('暂无课时来源')
    expect(drawer).toHaveTextContent('暂无课时变动记录')
  })

  it('uses intentional labels for missing generic reference configuration', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    replaceResources(api, {
      courseSpecs: [
        { id: 'with-reference', name: '关联待补课程', relatedId: 'missing-reference', status: 'active' },
        { id: 'without-reference', name: '未选关联课程', relatedId: '', status: 'draft' },
      ],
    })
    render(<CourseResourceWorkspace api={api} columns={[{ key: 'name', label: '名称' }, { key: 'relatedId', label: '关联课程', options: [] }]} defaultValues={{}} description="测试关联数据缺失时的用户提示。" eyebrow="课程配置" fields={[{ key: 'relatedId', label: '关联课程', type: 'reference' }, { key: 'mode', label: '可选模式', type: 'select' }]} noun="课程规格" resource="courseSpecs" title="关联字段测试" token="token" writableResource="course-specs" />)

    const table = await screen.findByRole('table')
    expect(table).toHaveTextContent('关联信息待补充')
    await user.click((await screen.findAllByRole('button', { name: '新增课程规格' })).at(-1)!)
    const dialog = screen.getByRole('dialog', { name: '新增课程规格' })
    const reference = within(dialog).getByLabelText('关联课程')
    expect(reference).toHaveAttribute('placeholder', '搜索关联课程')
    await user.click(reference)
    expect(await within(dialog).findByText('暂无可选关联课程')).toBeInTheDocument()
  })
})

function replaceResources(api: OpsApi, resources: Partial<Record<CourseResourceKey, CourseRecord[]>>) {
  const original = api.listCourseResource.bind(api)
  api.listCourseResource = async <T extends CourseRecord = CourseRecord>(token: string, resource: CourseResourceKey, query = {}): Promise<CoursePage<T>> => {
    const items = resources[resource]
    if (!items) return original<T>(token, resource, query)
    return { items: structuredClone(items) as T[], page: 1, perPage: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 }
  }
}
