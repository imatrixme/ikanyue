import type { CourseRecord } from './courseTypes'

export interface ReferenceOption {
  value: string
  label: string
  description?: string
  keywords?: string
}

export interface PersonReference {
  id: string
  name?: string
  realName?: string
  nickName?: string
  cellphone?: string
  status?: string | null
}

type StudentLike = PersonReference & {
  avatar?: string
  blocked?: boolean
}

const STATUS_LABELS: Record<string, string> = {
  active: '启用',
  inactive: '停用',
  draft: '草稿',
  pending: '待处理',
  pending_activation: '待激活',
  unactivated: '待激活',
  scheduled: '待上课',
  published: '已发布',
  confirmed: '已确认',
  completed: '已完成',
  settled: '已核销',
  cancelled: '已取消',
  depleted: '已用完',
  expired: '已过期',
  released: '已退回',
  reversed: '已更正',
  blocked: '已停用',
  open: '待处理',
  resolved: '已处理',
  failed: '失败',
  succeeded: '成功',
}

const ROLE_LABELS: Record<string, string> = {
  lead: '主教老师',
  assistant: '助教老师',
  observer: '观课老师',
  evaluator: '评估老师',
  admin: '管理员',
  teacher: '教师',
}

const DELIVERY_LABELS: Record<string, string> = {
  group: '班级课',
  one_to_one: '一对一',
  workshop: '工作坊',
  online: '线上课',
  hybrid: '线上线下结合',
}

const ACTIVATION_LABELS: Record<string, string> = {
  GRANT_TIME: '发放后立即生效',
  FIRST_RESERVATION: '首次预约时生效',
  FIRST_CHECK_IN: '首次签到时生效',
  FIRST_COMPLETED_SESSION: '首次完课时生效',
  TERM_START: '学期开始时生效',
}

const EXPIRY_LABELS: Record<string, string> = {
  FIXED_DURATION: '按固定天数有效',
  TERM_END: '本学期结束时到期',
  NO_EXPIRY: '长期有效',
  INHERIT_SOURCE: '沿用原课时有效期',
  RESET_ON_CONVERSION: '兑换后重新计算有效期',
  RESET_ON_ACTIVATION: '生效后开始计算有效期',
  MIN_SOURCE_AND_NEW: '取原有效期与新有效期中较早日期',
  TARGET_TERM_END: '目标课程学期结束时到期',
}

const CHANNEL_LABELS: Record<string, string> = {
  admin: '后台销售',
  offline: '线下销售',
  online: '线上销售',
}

const TEACHER_TIER_LABELS: Record<string, string> = {
  standard: '标准教师',
  senior: '资深教师',
  expert: '专家教师',
}

const CREDIT_EVENT_LABELS: Record<string, string> = {
  GRANT: '课时到账',
  CONVERT_OUT: '兑换支出',
  CONVERT_IN: '兑换获得',
  FREEZE: '用于未来课程',
  ACTIVATE: '课时生效',
  CONSUME: '上课使用',
  RELEASE: '预约取消后退回',
  EXPIRE: '到期失效',
  EXTEND: '有效期延长',
  REVERSE: '业务更正',
  ADJUST: '人工调整',
  EARN: '课堂工作量',
  COMPENSATE: '工作量补偿',
  CONFIRM: '工作量确认',
}

const CREDIT_STATUS_LABELS: Record<string, string> = {
  pending: '待预约课时',
  credit_insufficient: '课时余额不足',
  conversion_required: '需要先兑换课时',
  reserved: '已为本节课预留',
  consumed: '已从余额扣减',
  released: '已退回课时余额',
  reversed: '扣减记录已更正',
  settled: '已完成课时核销',
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  completed: '报课已完成',
  awaiting_class_assignment: '等待分班',
  synchronizing_future_lessons: '等待同步未来课堂名单',
  completed_with_warnings: '报课完成，有事项需确认',
  failed: '报课失败',
}

export function statusLabel(value: unknown) {
  return dictionaryLabel(STATUS_LABELS, value, '状态待确认')
}

export function roleLabel(value: unknown) {
  return dictionaryLabel(ROLE_LABELS, value, '角色待确认')
}

export function deliveryModeLabel(value: unknown) {
  return dictionaryLabel(DELIVERY_LABELS, value, '授课形式待确认')
}

export function activationModeLabel(value: unknown) {
  return dictionaryLabel(ACTIVATION_LABELS, value, '按课程规则生效')
}

export function expiryPolicyLabel(value: unknown) {
  return dictionaryLabel(EXPIRY_LABELS, value, '按当前有效期规则')
}

export function saleChannelLabel(value: unknown) {
  return dictionaryLabel(CHANNEL_LABELS, value, '其他销售渠道')
}

export function teacherTierLabel(value: unknown) {
  return dictionaryLabel(TEACHER_TIER_LABELS, value, '教师要求待确认')
}

export function creditEventLabel(value: unknown) {
  return dictionaryLabel(CREDIT_EVENT_LABELS, value, '课时变动')
}

export function creditStatusLabel(value: unknown) {
  return dictionaryLabel(CREDIT_STATUS_LABELS, value, '课时状态待确认')
}

export function enrollmentStatusLabel(value: unknown) {
  return dictionaryLabel(ENROLLMENT_STATUS_LABELS, value, '报课处理中')
}

export function personName(person: StudentLike | undefined, fallbackId = '') {
  const name = person?.realName || person?.name || person?.nickName
  return clean(name) || unresolvedLabel('人员', person?.id || fallbackId)
}

export function personLabel(person: StudentLike | undefined, fallbackId = '') {
  const name = personName(person, fallbackId)
  const cellphone = clean(person?.cellphone)
  return cellphone ? `${name} · ${cellphone}` : name
}

export function personOption(person: StudentLike): ReferenceOption {
  const name = personName(person)
  const cellphone = clean(person.cellphone)
  return {
    value: person.id,
    label: name,
    description: cellphone || (person.status ? statusLabel(person.status) : '暂无联系方式'),
    keywords: [name, cellphone, person.nickName, person.id].filter(Boolean).join(' '),
  }
}

export function recordName(record: CourseRecord | undefined, fallbackId = '', noun = '业务对象') {
  const name = clean(record?.name) || clean(record?.title) || clean(record?.operationNo) || clean(record?.code)
  return name || unresolvedLabel(noun, record?.id || fallbackId)
}

export function recordOption(record: CourseRecord, description?: string): ReferenceOption {
  const label = recordName(record)
  const secondary = description || [clean(record.code), record.status ? statusLabel(record.status) : ''].filter(Boolean).join(' · ')
  return { value: record.id, label, description: secondary || undefined, keywords: `${label} ${secondary} ${record.id}` }
}

export function referenceName(records: Map<string, CourseRecord>, id: unknown, noun: string) {
  const value = clean(id)
  return value ? recordName(records.get(value), value, noun) : `未选择${noun}`
}

export function personReferenceName(records: Map<string, PersonReference>, id: unknown, noun = '人员') {
  const value = clean(id)
  return value ? personName(records.get(value), value) : `未选择${noun}`
}

export function shortIdentifier(value: unknown) {
  const text = clean(value)
  if (!text) return '-'
  return text.length <= 10 ? text : `${text.slice(0, 4)}...${text.slice(-4)}`
}

export function unresolvedLabel(noun: string, id: unknown) {
  const suffix = shortIdentifier(id)
  return suffix === '-' ? `${noun}信息缺失` : `未找到${noun}（${suffix}）`
}

export function formatMoney(amount: unknown, currency: unknown = 'CNY') {
  const number = Number(amount)
  if (!Number.isFinite(number)) return '金额待确认'
  const code = clean(currency) || 'CNY'
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(number)
  } catch {
    return `${number} ${code}`
  }
}

export function formatDateTime(value: unknown, fallback = '时间待定') {
  const text = clean(value)
  if (!text) return fallback
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(date)
}

export function formatDate(value: unknown, fallback = '日期待定') {
  const text = clean(value)
  if (!text) return fallback
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

export function safeDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return '请在技术信息中查看'
  return String(value)
}

export function courseFieldValue(key: string, value: unknown) {
  if (key === 'status' || key.endsWith('Status')) return statusLabel(value)
  if (key === 'role' || key.endsWith('Role')) return roleLabel(value)
  if (key === 'deliveryMode') return deliveryModeLabel(value)
  if (key === 'activationMode') return activationModeLabel(value)
  if (key === 'expiryPolicy') return expiryPolicyLabel(value)
  if (key === 'saleChannel') return saleChannelLabel(value)
  if (key === 'teacherTier') return teacherTierLabel(value)
  if (key === 'eventType') return creditEventLabel(value)
  if (key === 'durationMinutes') return value === null || value === undefined || value === '' ? '-' : `${value} 分钟`
  if (key === 'created' || key === 'updated' || key.startsWith('valid') || key.endsWith('At')) return formatDateTime(value, '-')
  return safeDisplayValue(value)
}

export function technicalValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function mapById<T extends { id: string }>(records: T[]) {
  return new Map(records.map((record) => [record.id, record]))
}

function dictionaryLabel(dictionary: Record<string, string>, value: unknown, fallback: string) {
  const key = clean(value)
  return key ? dictionary[key] || dictionary[key.toUpperCase()] || fallback : fallback
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}
