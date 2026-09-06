import type { OfferPolicy } from './commerceApi'

export function cancellationPolicyText(policy: OfferPolicy) {
  if (policy.reservationRefund !== 'cash') return '取消预约按预约规则退回课时，不自动退现金；剩余未使用课时可按实付申请退款。'
  const rules = policy.cancellationTiers.map((tier, index) => {
    const above = index ? policy.cancellationTiers[index - 1].beforeMinutes : null
    const time = tier.beforeMinutes === 0
      ? above === null ? '开课时及之前' : `距开课不足${duration(above)}（含开课时）`
      : above === null ? `提前${duration(tier.beforeMinutes)}及以上` : `提前${duration(tier.beforeMinutes)}至不足${duration(above)}`
    return `${time}取消，${tier.feeBps === 0 ? '不扣费' : `扣实付的${tier.feeBps / 100}%`}`
  })
  return `${rules.join('；')}；开课后不退款。机构取消不扣费。`
}
function duration(minutes: number) { return minutes % 1440 === 0 ? `${minutes / 1440}天` : minutes % 60 === 0 ? `${minutes / 60}小时` : `${minutes}分钟` }
