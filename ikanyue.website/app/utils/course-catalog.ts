import type { PublicCoursePackage } from '~/types/content'

export function formatPackagePrice(item: PublicCoursePackage): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: item.price.currency || 'CNY', maximumFractionDigits: 0,
  }).format(item.price.saleAmount)
}

export function formatPackageValidity(item: PublicCoursePackage): string {
  if (item.validity.expiryPolicy === 'NO_EXPIRY') return '长期有效'
  if (item.validity.expiryPolicy === 'TERM_END') return '随学期结束'
  return item.validity.validityDurationDays === null
    ? '有效期以确认单为准'
    : `激活后 ${item.validity.validityDurationDays} 天有效`
}

export function packageHandoffHref(item: PublicCoursePackage, miniProgramUrl = ''): string {
  if (item.purchaseMode === 'mini_program' && miniProgramUrl) {
    return miniProgramUrl.includes('{packageCode}')
      ? miniProgramUrl.replace('{packageCode}', encodeURIComponent(item.code))
      : `${miniProgramUrl}${miniProgramUrl.includes('?') ? '&' : '?'}package=${encodeURIComponent(item.code)}`
  }
  return `/contact?package=${encodeURIComponent(item.code)}`
}
