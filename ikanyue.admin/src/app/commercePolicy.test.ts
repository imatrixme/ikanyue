import { expect, it } from 'vitest'
import { cancellationPolicyText } from './commercePolicy'

it('distinguishes legacy credit release from non-overlapping cash refund tiers', () => {
  const policy = { version: 1, packageRefund: 'unused_paid_value' as const, cancellationTiers: [{ beforeMinutes: 1440, feeBps: 0 }, { beforeMinutes: 60, feeBps: 5000 }, { beforeMinutes: 0, feeBps: 10000 }] }
  expect(cancellationPolicyText(policy)).toContain('不自动退现金')
  const cash = cancellationPolicyText({ ...policy, reservationRefund: 'cash' })
  expect(cash).toContain('提前1天及以上取消，不扣费')
  expect(cash).toContain('提前1小时至不足1天取消，扣实付的50%')
  expect(cash).toContain('距开课不足1小时（含开课时）取消，扣实付的100%')
})
