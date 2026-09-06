const { createHash } = require('node:crypto');
const { invariant } = require('../courseCredits/domain');
const { create, update, versionClaim } = require('../courseCredits/reservationRequests');

const id = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 15);
const escape = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
function amountMinor(value) {
    const valueMinor = Math.round(Number(value) * 100);
    invariant(Number.isSafeInteger(valueMinor) && valueMinor > 0 && valueMinor <= 100000000
        && Math.abs(Number(value) * 100 - valueMinor) < 0.00001,
    'INVALID_COMMERCE_AMOUNT', '课程价格必须是精确到分的正数');
    return valueMinor;
}
function commerceUpdate(collection, row, data) {
    return [create('commerce_claims', { id: id(collection, row.id, row.version), key: `${collection}:${row.id}:${row.version}` }),
        update(collection, row.id, { ...data, version: row.version + 1 })];
}
function auditOperation(operationId, order, reason, at, actor) {
    return create('credit_operations', {
        id: operationId, operationNo: `COM-${operationId}`, studentId: order.studentId,
        type: 'adjust', status: 'committed', idempotencyKey: `commerce:${operationId}`,
        sourceType: 'order', sourceId: order.id, actorId: actor?.id || order.studentId, actorRole: actor?.role || 'service',
        requestSnapshot: { orderId: order.id, actor }, resultSnapshot: { orderId: order.id },
        reason, outcome: 'committed', beforeSummary: { status: order.status }, afterSummary: { reason, at },
    });
}
function orderUpdate(order, operationId, data) {
    return [versionClaim(() => id('claim', order.id, order.version), 'order', order.id, order.version, operationId),
        update('orders', order.id, { ...data, version: order.version + 1 })];
}
function validatePolicy(policy) {
    invariant(policy && policy.packageRefund === 'unused_paid_value'
        && Number.isInteger(policy.version) && policy.version > 0,
    'COMMERCE_POLICY_REQUIRED', '课程尚未发布退费规则');
    invariant(Array.isArray(policy.cancellationTiers), 'INVALID_CANCELLATION_TIERS', '取消规则无效');
    invariant(policy.reservationRefund !== 'cash' || (policy.cancellationTiers.length > 0
        && policy.cancellationTiers.at(-1).beforeMinutes === 0), 'INVALID_CANCELLATION_TIERS', '请配置直至开课时的取消规则');
    let previousMinutes = Infinity;
    let previousFee = -1;
    for (const tier of policy.cancellationTiers) {
        invariant(Number.isInteger(tier.beforeMinutes) && tier.beforeMinutes >= 0
            && tier.beforeMinutes < previousMinutes && Number.isInteger(tier.feeBps)
            && tier.feeBps >= previousFee && tier.feeBps <= 10000 && tier.feeBps >= 0,
        'INVALID_CANCELLATION_TIERS', '取消规则必须按提前时间递减、扣费比例递增');
        previousMinutes = tier.beforeMinutes; previousFee = tier.feeBps;
    }
    return structuredClone(policy);
}
function cancellationQuote(policy, startAt, receivedAt, paidMinor, institution = false) {
    validatePolicy(policy);
    invariant(Number.isSafeInteger(paidMinor) && paidMinor >= 0, 'INVALID_COMMERCE_AMOUNT', '金额无效');
    const delta = Date.parse(startAt) - Date.parse(receivedAt);
    invariant(Number.isFinite(delta), 'INVALID_CANCELLATION_TIME', '取消时间无效');
    const tier = institution ? null : policy.cancellationTiers.find((entry) => delta >= entry.beforeMinutes * 60000);
    const feeBps = institution ? 0 : tier?.feeBps ?? 10000;
    const fee = Math.floor(paidMinor * feeBps / 10000);
    return { fee, refundable: paidMinor - fee, receivedAt, policyVersion: policy.version };
}

function allocateMinor(amount, lines, creditTypes) {
    const weights = lines.map((line) => (Number(creditTypes.get(line.creditTypeId).referenceUnitValue) || 1) * line.quantity);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let remainder = amount;
    return lines.map((line, index) => {
        const paidMinor = index === lines.length - 1 ? remainder : Math.floor(amount * weights[index] / total);
        remainder -= paidMinor;
        return { creditTypeId: line.creditTypeId, quantity: line.quantity, paidMinor };
    });
}

module.exports = { id, escape, amountMinor, commerceUpdate, auditOperation, orderUpdate, validatePolicy, cancellationQuote, allocateMinor };
