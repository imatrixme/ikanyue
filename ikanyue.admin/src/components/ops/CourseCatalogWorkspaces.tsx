import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { BookingReferenceData } from '../../app/bookingTypes'
import { formatMoney, recordOption, type ReferenceOption } from '../../app/coursePresentation'
import type { CourseRecord } from '../../app/courseTypes'
import { Tabs } from '../ui/DataDisplay'
import { CourseResourceWorkspace, type ResourceColumn, type ResourceField } from './CourseResourceWorkspace'

interface WorkspaceProps { api: OpsApi; token: string }

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
]

const courseColumns: ResourceColumn[] = [
  { key: 'name', label: '课程名称' },
  { key: 'code', label: '课程编码' },
  { key: 'deliveryMode', label: '授课形式' },
  { key: 'durationMinutes', label: '单节时长' },
  { key: 'teacherTier', label: '教师等级' },
  { key: 'status', label: '状态' },
]

export function CoursesWorkspace({ api, token }: WorkspaceProps) {
  const refs = useCatalogReferences(api, token)
  const fields: ResourceField[] = [
    { key: 'name', label: '课程名称', required: true },
    { key: 'code', label: '课程编码', required: true },
    { key: 'deliveryMode', label: '授课形式', required: true, type: 'select', options: [{ label: '班级课程', value: 'group' }, { label: '一对一课程', value: 'one_to_one' }, { label: '工作坊', value: 'workshop' }, { label: '线上课程', value: 'online' }, { label: '混合课程', value: 'hybrid' }] },
    { key: 'durationMinutes', label: '单节时长（分钟）', required: true, type: 'number' },
    { key: 'teacherTier', label: '教师要求', required: true, type: 'select', options: [{ label: '标准教师', value: 'standard' }, { label: '资深教师', value: 'senior' }, { label: '专家教师', value: 'expert' }] },
    { key: 'defaultCreditTypeId', label: '默认扣减课时', required: true, type: 'reference', options: refs.creditTypes, loading: refs.loading, emptyLabel: refs.error || '暂无可用课时类型', hint: '学员预约或上课时默认使用的课时余额。' },
  ]
  return <CourseResourceWorkspace api={api} columns={courseColumns} defaultValues={{ durationMinutes: 60, deliveryMode: 'group', teacherTier: 'standard', status: 'draft' }} description="定义课程名称、授课形式、单节时长与教师要求；启用后可用于课包和班级。" eyebrow="课程目录" fields={fields} noun="课程规格" resource="courseSpecs" statusOptions={statusOptions} title="课程规格" token={token} writableResource="course-specs" />
}

type PackageTab = 'packages' | 'prices' | 'grants' | 'conversions'

export function PackagesWorkspace({ api, token }: WorkspaceProps) {
  const [tab, setTab] = useState<PackageTab>('packages')
  const refs = useCatalogReferences(api, token)
  return <div className="grid gap-4"><div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4"><Tabs label="课包配置视图" onChange={setTab} options={[{ label: '课包', value: 'packages' }, { label: '价格与生效时间', value: 'prices' }, { label: '包含课时', value: 'grants' }, { label: '课时兑换', value: 'conversions' }]} value={tab} /></div>{tab === 'packages' ? <PackageList api={api} token={token} /> : null}{tab === 'prices' ? <PriceList api={api} refs={refs} token={token} /> : null}{tab === 'grants' ? <GrantList api={api} refs={refs} token={token} /> : null}{tab === 'conversions' ? <ConversionRuleList api={api} refs={refs} token={token} /> : null}</div>
}

function PackageList({ api, token }: WorkspaceProps) {
  const columns: ResourceColumn[] = [
    { key: 'name', label: '课包名称' }, { key: 'code', label: '编码' },
    { key: 'activationMode', label: '生效方式' }, { key: 'validityDurationDays', label: '有效天数' },
    { key: 'saleChannel', label: '销售渠道' }, { key: 'status', label: '状态' },
  ]
  const fields: ResourceField[] = [
    { key: 'name', label: '课包名称', required: true }, { key: 'code', label: '编码', required: true },
    { key: 'description', label: '说明' },
    { key: 'saleChannel', label: '销售渠道', type: 'select', required: true, options: [{ label: '后台销售', value: 'admin' }, { label: '线下销售', value: 'offline' }] },
    { key: 'activationMode', label: '生效方式', type: 'select', required: true, options: [{ label: '发放时', value: 'GRANT_TIME' }, { label: '首次完课', value: 'FIRST_COMPLETED_SESSION' }, { label: '首次排课', value: 'FIRST_RESERVATION' }] },
    { key: 'activationDeadlineDays', label: '最晚生效天数', type: 'number' },
    { key: 'validityDurationDays', label: '有效天数', type: 'number', required: true },
    { key: 'expiryPolicy', label: '有效期规则', type: 'select', required: true, options: [{ label: '固定期限', value: 'FIXED_DURATION' }, { label: '学期结束', value: 'TERM_END' }, { label: '长期有效', value: 'NO_EXPIRY' }] },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} defaultValues={{ saleChannel: 'admin', activationMode: 'FIRST_COMPLETED_SESSION', validityDurationDays: 180, activationDeadlineDays: 30, expiryPolicy: 'FIXED_DURATION', status: 'draft' }} description="一个课包可配置多条课程课时发放规则，并通过独立价格版本销售。" eyebrow="产品与课时" fields={fields} noun="课包" resource="packages" statusOptions={statusOptions} title="课包管理" token={token} writableResource="packages" />
}

function PriceList({ api, token, refs }: WorkspaceProps & { refs: CatalogReferences }) {
  const columns: ResourceColumn[] = [
    { key: 'packageId', label: '课包', options: refs.packages }, { key: 'version', label: '价格版本', render: (record) => `第 ${record.version || 1} 版` },
    { key: 'listAmount', label: '标价', render: (record) => formatMoney(record.listAmount, record.currency) }, { key: 'saleAmount', label: '实际售价', render: (record) => formatMoney(record.saleAmount, record.currency) },
    { key: 'validFrom', label: '开始时间' }, { key: 'status', label: '状态' },
  ]
  const fields: ResourceField[] = [
    { key: 'packageId', label: '适用课包', required: true, type: 'reference', options: refs.packages, loading: refs.loading, emptyLabel: refs.error || '暂无可用课包' }, { key: 'currency', label: '币种', required: true, type: 'select', options: [{ label: '人民币（CNY）', value: 'CNY' }] },
    { key: 'listAmount', label: '标价', type: 'number', required: true }, { key: 'saleAmount', label: '售价', type: 'number', required: true },
    { key: 'version', label: '版本号', type: 'number', required: true },
    { key: 'validFrom', label: '开始时间', type: 'datetime-local', required: true }, { key: 'validTo', label: '结束时间', type: 'datetime-local' },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} defaultValues={{ currency: 'CNY', version: 1, status: 'draft' }} description="价格修改会创建新版本，历史订单继续保留原价格快照。" eyebrow="产品与课时" fields={fields} noun="价格版本" resource="priceVersions" statusOptions={statusOptions} title="价格版本" token={token} writableResource="price-versions" />
}

function GrantList({ api, token, refs }: WorkspaceProps & { refs: CatalogReferences }) {
  const columns: ResourceColumn[] = [
    { key: 'packageId', label: '课包', options: refs.packages }, { key: 'creditTypeId', label: '包含课时', options: refs.creditTypes },
    { key: 'quantity', label: '课时数量' }, { key: 'created', label: '创建时间' },
  ]
  const fields: ResourceField[] = [
    { key: 'packageId', label: '适用课包', required: true, type: 'reference', options: refs.packages, loading: refs.loading, emptyLabel: refs.error || '暂无可用课包' },
    { key: 'creditTypeId', label: '包含的课时类型', required: true, type: 'reference', options: refs.creditTypes, loading: refs.loading, emptyLabel: refs.error || '暂无可用课时类型' },
    { key: 'quantity', label: '包含课时数', type: 'number', required: true },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} description="每条规则指定课包发放哪一种课程课时以及数量。" eyebrow="产品与课时" fields={fields} noun="发放规则" resource="grantLines" title="课时发放规则" token={token} writableResource="grant-lines" />
}

function ConversionRuleList({ api, token, refs }: WorkspaceProps & { refs: CatalogReferences }) {
  const columns: ResourceColumn[] = [
    { key: 'sourceCreditTypeId', label: '用哪种课时兑换', options: refs.creditTypes }, { key: 'targetCreditTypeId', label: '兑换成哪种课时', options: refs.creditTypes },
    { key: 'version', label: '规则版本', render: (record) => `第 ${record.version || 1} 版` }, { key: 'example', label: '最小兑换示例', render: conversionExample },
    { key: 'validFrom', label: '生效时间' }, { key: 'status', label: '状态' },
  ]
  const fields: ResourceField[] = [
    { key: 'sourceCreditTypeId', label: '用哪种课时兑换', required: true, type: 'reference', options: refs.creditTypes, loading: refs.loading, emptyLabel: refs.error || '暂无可用课时类型' },
    { key: 'targetCreditTypeId', label: '兑换成哪种课时', required: true, type: 'reference', options: refs.creditTypes, loading: refs.loading, emptyLabel: refs.error || '暂无可用课时类型' },
    { key: 'sourceQuantity', label: '需要扣减数量', type: 'number', required: true },
    { key: 'targetQuantity', label: '可以获得数量', type: 'number', required: true },
    { key: 'minSourceQuantity', label: '最小兑换数量', type: 'number', required: true },
    { key: 'maxSourceQuantity', label: '单次最大数量', type: 'number' },
    { key: 'expiryPolicy', label: '目标有效期', type: 'select', required: true, options: [{ label: '继承来源批次', value: 'INHERIT_SOURCE' }, { label: '兑换时重置', value: 'RESET_ON_CONVERSION' }, { label: '激活时重置', value: 'RESET_ON_ACTIVATION' }, { label: '取来源与新期限较早值', value: 'MIN_SOURCE_AND_NEW' }, { label: '目标学期结束', value: 'TARGET_TERM_END' }] },
    { key: 'activationMode', label: '目标激活方式', type: 'select', required: true, options: [{ label: '兑换时激活', value: 'GRANT_TIME' }, { label: '首次排课', value: 'FIRST_RESERVATION' }, { label: '首次签到', value: 'FIRST_CHECK_IN' }, { label: '首次完课', value: 'FIRST_COMPLETED_SESSION' }, { label: '学期开始', value: 'TERM_START' }] },
    { key: 'validityDurationDays', label: '重置有效天数', type: 'number' },
    { key: 'activationDeadlineDays', label: '最晚激活天数', type: 'number' },
    { key: 'reversible', label: '允许撤销本次兑换', type: 'checkbox' },
    { key: 'referenceValueLimit', label: '价值差异上限', type: 'number', required: true, hint: '用于阻止明显不等价的兑换规则。' },
    { key: 'validFrom', label: '生效时间', type: 'datetime-local', required: true },
    { key: 'validTo', label: '失效时间', type: 'datetime-local' },
    { key: 'version', label: '版本号', type: 'number', required: true },
  ]
  const validFrom = new Date().toISOString().slice(0, 16)
  return <CourseResourceWorkspace api={api} columns={columns} defaultValues={{ sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000, expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0, activationDeadlineDays: 0, reversible: false, referenceValueLimit: 1, validFrom, validTo: '', version: 1, status: 'draft' }} description="发布时校验整张有向兑换图，拒绝可套利循环；修改、发布和停用都会创建不可变新版本。" eyebrow="产品与课时" fields={fields} noun="兑换规则" resource="conversionRules" statusOptions={statusOptions} title="兑换规则" token={token} writableResource="conversion-rules" />
}

function conversionExample(record: Record<string, unknown>) {
  const source = Number(record.sourceQuantity || 0)
  const target = Number(record.targetQuantity || 0)
  const minimum = Number(record.minSourceQuantity || 0)
  return source > 0 ? `${minimum} 课时可兑换 ${(minimum / source) * target} 课时` : '-'
}

interface CatalogReferences {
  packages: ReferenceOption[]
  creditTypes: ReferenceOption[]
  loading: boolean
  error: string
}

function useCatalogReferences(api: OpsApi, token: string): CatalogReferences {
  const [packages, setPackages] = useState<CourseRecord[]>([])
  const [bookingRefs, setBookingRefs] = useState<BookingReferenceData>({ teachers: [], courses: [], creditTypes: [], policies: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [packagePage, referenceData] = await Promise.all([
        api.listCourseResource(token, 'packages', { page: 1, perPage: 100 }),
        api.getBookingReferenceData(token),
      ])
      setPackages(packagePage.items)
      setBookingRefs(referenceData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '关联数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [api, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  return useMemo(() => ({
    packages: packages.map((record) => recordOption(record, [record.code, record.status === 'active' ? '正在销售' : '未启用'].filter(Boolean).join(' · '))),
    creditTypes: bookingRefs.creditTypes.map((item) => ({ value: item.id, label: item.name, description: item.unitLabel || item.code, keywords: `${item.name} ${item.code} ${item.id}` })),
    loading,
    error,
  }), [bookingRefs.creditTypes, error, loading, packages])
}
