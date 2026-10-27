import type { PublicCoursePackage } from '~/types/content'

// Catalog enums stay internal; the site only shows these visitor-facing words.
const DELIVERY_LABELS: Record<string, string> = {
  one_to_one: '一对一', group: '小组课', workshop: '工作坊', online: '线上课', hybrid: '线上线下结合',
}
const UNIT_LABELS: Record<string, string> = { lesson: '节', session: '次', hour: '小时', credit: '课点' }
const ACTIVATION_LABELS: Record<string, string> = {
  GRANT_TIME: '购买后立即生效',
  FIRST_RESERVATION: '首次预约时生效',
  FIRST_CHECK_IN: '首次到课时生效',
  FIRST_COMPLETED_SESSION: '首次完课后生效',
  TERM_START: '学期开始时生效',
}

export const deliveryLabel = (mode: string): string => DELIVERY_LABELS[mode] || '面授课程'
export const activationLabel = (mode: string): string => ACTIVATION_LABELS[mode] || '以确认单为准'

export function grantQuantity(grant: PublicCoursePackage['grants'][number]): string {
  const unit = UNIT_LABELS[grant.unitLabel] ?? (/^[a-z_]+$/i.test(grant.unitLabel) ? '节' : grant.unitLabel)
  return `${grant.quantity} ${unit}`
}

export function formatMoney(amount: number, currency = 'CNY'): string {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function formatPackagePrice(item: PublicCoursePackage): string {
  return formatMoney(item.price.saleAmount, item.price.currency || 'CNY')
}

export function formatPackageValidity(item: PublicCoursePackage): string {
  if (item.validity.expiryPolicy === 'NO_EXPIRY') return '长期有效'
  if (item.validity.expiryPolicy === 'TERM_END') return '随学期结束'
  const start = item.validity.activationMode === 'GRANT_TIME' ? '购买后' : '生效后'
  return item.validity.validityDurationDays === null
    ? '有效期以确认单为准'
    : `${start} ${item.validity.validityDurationDays} 天有效`
}

export function packageHandoffHref(item: PublicCoursePackage, miniProgramUrl = ''): string {
  if (item.purchaseMode === 'mini_program' && miniProgramUrl) {
    return miniProgramUrl.includes('{packageCode}')
      ? miniProgramUrl.replace('{packageCode}', encodeURIComponent(item.code))
      : `${miniProgramUrl}${miniProgramUrl.includes('?') ? '&' : '?'}package=${encodeURIComponent(item.code)}`
  }
  return `/contact?package=${encodeURIComponent(item.code)}`
}
