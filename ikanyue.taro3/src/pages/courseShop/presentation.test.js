import { describe, expect, it } from 'vitest';
import { money, orderStatus, policyText } from './presentation';

it('discloses each inclusive cash-cancellation threshold before checkout', () => {
  const text = policyText({ packageRefund: 'unused_paid_value', reservationRefund: 'cash', cancellationTiers: [
    { beforeMinutes: 1440, feeBps: 0 }, { beforeMinutes: 60, feeBps: 5000 }, { beforeMinutes: 0, feeBps: 10000 },
  ] });
  expect(text).toContain('提前1天及以上取消，不扣费');
  expect(text).toContain('提前1小时至不足1天取消，扣该课时实付金额的50%');
  expect(text).toContain('距开课不足1小时（含开课时）');
  expect(text).toContain('对应课时不可再使用');
});

describe('commerce presentation', () => {
  it('prioritizes refund processing and paid-but-not-granted states', () => {
    expect(orderStatus({ status: 'completed', amount: 100, refundPending: true })).toBe('退款处理中');
    expect(orderStatus({ status: 'completed', amount: 100, refunded: 100 })).toBe('已全部退款');
    expect(orderStatus({ status: 'completed', amount: 100, refunded: 1 })).toBe('已部分退款');
    expect(orderStatus({ status: 'granting' })).toBe('付款成功，课时到账中');
    expect(orderStatus({ status: 'unexpected' })).toBe('状态待核对');
  });
  it('uses exact minor units and does not promise a refund above payment', () => {
    expect(money(1)).toBe('0.01');
    expect(policyText({ packageRefund: 'unused_paid_value' })).toContain('不会超过实际付款');
    expect(policyText(null)).toBe('退费规则尚未发布');
  });
});
