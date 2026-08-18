import { useState } from 'react'

import type { OpsApi } from '../../app/api'
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

const courseFields: ResourceField[] = [
  { key: 'name', label: '课程名称', required: true },
  { key: 'code', label: '课程编码', required: true },
  { key: 'deliveryMode', label: '授课形式', required: true, type: 'select', options: [{ label: '班级课程', value: 'group' }, { label: '一对一课程', value: 'one_to_one' }, { label: '工作坊', value: 'workshop' }, { label: '线上课程', value: 'online' }, { label: '混合课程', value: 'hybrid' }] },
  { key: 'durationMinutes', label: '单节分钟数', required: true, type: 'number' },
  { key: 'teacherTier', label: '教师等级', required: true },
  { key: 'defaultCreditTypeId', label: '默认课时类型编号', required: true },
]

export function CoursesWorkspace({ api, token }: WorkspaceProps) {
  return <CourseResourceWorkspace api={api} columns={courseColumns} defaultValues={{ durationMinutes: 60, deliveryMode: 'group', teacherTier: 'standard', status: 'draft' }} description="定义课程名称、授课形式、单节时长与教师要求；启用后可用于课包和班级。" eyebrow="课程目录" fields={courseFields} noun="课程规格" resource="courseSpecs" statusOptions={statusOptions} title="课程规格" token={token} writableResource="course-specs" />
}

type PackageTab = 'packages' | 'prices' | 'grants' | 'conversions'

export function PackagesWorkspace({ api, token }: WorkspaceProps) {
  const [tab, setTab] = useState<PackageTab>('packages')
  return <div className="grid gap-4"><div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4"><Tabs label="课包配置视图" onChange={setTab} options={[{ label: '课包', value: 'packages' }, { label: '价格版本', value: 'prices' }, { label: '发放规则', value: 'grants' }, { label: '兑换规则', value: 'conversions' }]} value={tab} /></div>{tab === 'packages' ? <PackageList api={api} token={token} /> : null}{tab === 'prices' ? <PriceList api={api} token={token} /> : null}{tab === 'grants' ? <GrantList api={api} token={token} /> : null}{tab === 'conversions' ? <ConversionRuleList api={api} token={token} /> : null}</div>
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
    { key: 'saleChannel', label: '销售渠道', type: 'select', required: true, options: [{ label: 'Admin', value: 'admin' }, { label: '线下', value: 'offline' }] },
    { key: 'activationMode', label: '生效方式', type: 'select', required: true, options: [{ label: '发放时', value: 'GRANT_TIME' }, { label: '首次完课', value: 'FIRST_COMPLETED_SESSION' }, { label: '首次排课', value: 'FIRST_RESERVATION' }] },
    { key: 'activationDeadlineDays', label: '最晚生效天数', type: 'number' },
    { key: 'validityDurationDays', label: '有效天数', type: 'number', required: true },
    { key: 'expiryPolicy', label: '有效期规则', type: 'select', required: true, options: [{ label: '固定期限', value: 'FIXED_DURATION' }, { label: '学期结束', value: 'TERM_END' }, { label: '长期有效', value: 'NO_EXPIRY' }] },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} defaultValues={{ saleChannel: 'admin', activationMode: 'FIRST_COMPLETED_SESSION', validityDurationDays: 180, activationDeadlineDays: 30, expiryPolicy: 'FIXED_DURATION', status: 'draft' }} description="一个课包可配置多条课程课时发放规则，并通过独立价格版本销售。" eyebrow="产品与课时" fields={fields} noun="课包" resource="packages" statusOptions={statusOptions} title="课包管理" token={token} writableResource="packages" />
}

function PriceList({ api, token }: WorkspaceProps) {
  const columns: ResourceColumn[] = [
    { key: 'packageId', label: '课包编号' }, { key: 'version', label: '版本' },
    { key: 'listAmount', label: '标价' }, { key: 'saleAmount', label: '售价' },
    { key: 'validFrom', label: '开始时间' }, { key: 'status', label: '状态' },
  ]
  const fields: ResourceField[] = [
    { key: 'packageId', label: '课包编号', required: true }, { key: 'currency', label: '币种', required: true },
    { key: 'listAmount', label: '标价', type: 'number', required: true }, { key: 'saleAmount', label: '售价', type: 'number', required: true },
    { key: 'version', label: '版本号', type: 'number', required: true },
    { key: 'validFrom', label: '开始时间', type: 'datetime-local', required: true }, { key: 'validTo', label: '结束时间', type: 'datetime-local' },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} defaultValues={{ currency: 'CNY', version: 1, status: 'draft' }} description="价格修改会创建新版本，历史订单继续保留原价格快照。" eyebrow="产品与课时" fields={fields} noun="价格版本" resource="priceVersions" statusOptions={statusOptions} title="价格版本" token={token} writableResource="price-versions" />
}

function GrantList({ api, token }: WorkspaceProps) {
  const columns: ResourceColumn[] = [
    { key: 'packageId', label: '课包编号' }, { key: 'creditTypeId', label: '课程课时类型' },
    { key: 'quantity', label: '课时数量' }, { key: 'created', label: '创建时间' },
  ]
  const fields: ResourceField[] = [
    { key: 'packageId', label: '课包编号', required: true },
    { key: 'creditTypeId', label: '课程课时类型编号', required: true },
    { key: 'quantity', label: '发放课时', type: 'number', required: true },
  ]
  return <CourseResourceWorkspace api={api} columns={columns} description="每条规则指定课包发放哪一种课程课时以及数量。" eyebrow="产品与课时" fields={fields} noun="发放规则" resource="grantLines" title="课时发放规则" token={token} writableResource="grant-lines" />
}

function ConversionRuleList({ api, token }: WorkspaceProps) {
  const columns: ResourceColumn[] = [
    { key: 'sourceCreditTypeId', label: '来源课时' }, { key: 'targetCreditTypeId', label: '目标课时' },
    { key: 'version', label: '版本' }, { key: 'example', label: '最小兑换示例', render: conversionExample },
    { key: 'validFrom', label: '生效时间' }, { key: 'status', label: '状态' },
  ]
  const fields: ResourceField[] = [
    { key: 'sourceCreditTypeId', label: '来源课时类型编号', required: true },
    { key: 'targetCreditTypeId', label: '目标课时类型编号', required: true },
    { key: 'sourceQuantity', label: '来源比例', type: 'number', required: true },
    { key: 'targetQuantity', label: '目标比例', type: 'number', required: true },
    { key: 'minSourceQuantity', label: '最小兑换数量', type: 'number', required: true },
    { key: 'maxSourceQuantity', label: '单次最大数量', type: 'number' },
    { key: 'expiryPolicy', label: '目标有效期', type: 'select', required: true, options: [{ label: '继承来源批次', value: 'INHERIT_SOURCE' }, { label: '兑换时重置', value: 'RESET_ON_CONVERSION' }, { label: '激活时重置', value: 'RESET_ON_ACTIVATION' }, { label: '取来源与新期限较早值', value: 'MIN_SOURCE_AND_NEW' }, { label: '目标学期结束', value: 'TARGET_TERM_END' }] },
    { key: 'activationMode', label: '目标激活方式', type: 'select', required: true, options: [{ label: '兑换时激活', value: 'GRANT_TIME' }, { label: '首次排课', value: 'FIRST_RESERVATION' }, { label: '首次签到', value: 'FIRST_CHECK_IN' }, { label: '首次完课', value: 'FIRST_COMPLETED_SESSION' }, { label: '学期开始', value: 'TERM_START' }] },
    { key: 'validityDurationDays', label: '重置有效天数', type: 'number' },
    { key: 'activationDeadlineDays', label: '最晚激活天数', type: 'number' },
    { key: 'reversible', label: '允许反向兑换', type: 'checkbox' },
    { key: 'referenceValueLimit', label: '参考价值倍率上限', type: 'number', required: true },
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
  return source > 0 ? `${minimum} -> ${(minimum / source) * target}` : '-'
}
