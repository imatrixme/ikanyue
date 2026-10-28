export const money = (minor) => (Number(minor || 0) / 100).toFixed(2);
export function orderStatus(order) {
  if (order.refundPending) return '退款处理中';
  if (order.refunded >= order.amount && order.amount > 0) return '已全部退款';
  if (order.refunded > 0) return '已部分退款';
  return { pending: '待付款', granting: '付款成功，课时到账中', completed: '课时已到账', failed: '付款未完成' }[order.status] || '状态待核对';
}
export function policyText(policy) {
  if (policy?.packageRefund !== 'unused_paid_value') return '退费规则尚未发布';
  const unused = '剩余未使用课时按实付分摊金额退还，已预约课程需先处理；退款不会超过实际付款。';
  if (policy.reservationRefund !== 'cash') return `${unused}取消预约按预约规则退回课时，不自动退现金。`;
  const rules = policy.cancellationTiers.map((tier, index) => {
    const above = index ? policy.cancellationTiers[index - 1].beforeMinutes : null;
    const time = tier.beforeMinutes === 0
      ? above === null ? '开课时及之前' : `距开课不足${duration(above)}（含开课时）`
      : above === null ? `提前${duration(tier.beforeMinutes)}及以上` : `提前${duration(tier.beforeMinutes)}至不足${duration(above)}`;
    return `${time}取消，${tier.feeBps === 0 ? '不扣费' : `扣该课时实付金额的${tier.feeBps / 100}%`}`;
  });
  return `${unused}${rules.join('；')}；开课后不退款。取消后对应课时不可再使用；机构取消不扣费。`;
}
function duration(minutes) { return minutes % 1440 === 0 ? `${minutes / 1440}天` : minutes % 60 === 0 ? `${minutes / 60}小时` : `${minutes}分钟`; }

// Unpaid orders close after the gateway payment window (kanyue.pay PaymentTTL).
export const PENDING_ORDER_NOTICE = '请在下单后 30 分钟内完成支付，超时订单会自动关闭。';

const PAYMENT_WINDOW_MS = 30 * 60000;

// An unpaid order for the same offer is resumed instead of creating another one, while its payment window is open.
export function pendingOrderFor(orders, offerId, now = Date.now()) {
  return (orders || []).find((order) => order.status === 'pending' && order.offerId === offerId
    && now - Date.parse(order.createdAt) < PAYMENT_WINDOW_MS) || null;
}
