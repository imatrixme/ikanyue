import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Black-box commerce journey: it talks only to the business API, the business PocketBase
// REST API (superuser reads) and the payment gateway, so it runs against whichever backend owns commerce.
const config = JSON.parse(readFileSync(new URL('../.local/native/environment.json', import.meta.url), 'utf8'));
const base = `http://127.0.0.1:${config.PORT}`;
async function eventually(action) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { return await action(); }
    catch (error) { if (attempt === 29) throw error; await new Promise((done) => setTimeout(done, 100)); }
  }
}
async function call(path, token, body) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return response.json();
}
async function api(path, token, body) {
  const result = await call(path, token, body);
  assert.equal(result.code, 10000, `${path}: ${result.message}`);
  return result.data;
}
async function rejected(path, token, body, errorCode) {
  const result = await call(path, token, body);
  assert.equal(result.errorCode, errorCode, `${path}: ${result.message}`);
}
// gateway calls the payment service directly; tokens never reach the output.
async function gateway(path, method = 'GET', body, mock = false) {
  const token = mock ? config.PAY_MOCK_TOKEN : config.PAY_SERVICE_TOKEN;
  const response = await fetch(`${config.PAY_GATEWAY_URL}${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`gateway ${path}: ${response.status} ${result?.error || ''}`);
  return result;
}
async function mockSuccess(id) {
  await gateway(`/_test/observations/${encodeURIComponent(id)}`, 'POST', { status: 'succeeded' }, true);
  await gateway('/_test/poll', 'POST', {}, true);
}
let superuser;
async function record(collection, id) {
  if (!superuser) {
    const response = await fetch(`${base}/api/collections/_superusers/auth-with-password`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: config.PB_EMAIL, password: config.PB_PASSWORD }) });
    assert.equal(response.status, 200, 'PocketBase superuser login failed');
    superuser = (await response.json()).token;
  }
  const response = await fetch(`${base}/api/collections/${collection}/records/${encodeURIComponent(id)}`, { headers: { Authorization: superuser } });
  assert.equal(response.status, 200, `${collection}/${id}: ${response.status}`);
  return response.json();
}

async function main() {
  const tiered = process.argv.includes('--tiered');
  const health = await (await fetch(`${config.PAY_GATEWAY_URL}/health`)).json();
  assert.equal(health.provider, config.PAY_PROVIDER);
  const admin = await api('/ops/auth/login', '', { account: 'admin', password: 'admin870329' });
  // sync settles one order and its processing refunds against the gateway, as the recovery job would.
  const sync = (orderId) => eventually(() => api(`/ops/commerce/orders/${orderId}/recover`, admin.token,
    { key: randomUUID(), reason: '本地联调同步' }));
  const cellphone = `199${String(Date.now()).slice(-8)}`;
  await api('/ops/students', admin.token, { cellphone, password: config.LOCAL_STUDENT_PASSWORD,
    realName: '支付联调学员', nickName: '本地自动验收', blocked: false });
  const user = await api('/v1/user/login', '', { cellphone, password: config.LOCAL_STUDENT_PASSWORD });
  const root = '/v1/student/commerce';
  const offers = await api(`${root}/catalog`, user.token);
  assert.ok(offers.length > 0, 'Seed must publish at least one local offer');
  const key = `smoke-${randomUUID()}`;
  let offerId = offers.find((offer) => offer.quantity === 4).id;
  if (tiered) {
    const original = await record('commerce_offers', offerId);
    const draft = await api('/ops/commerce/offers', admin.token, { key, name: '分时点退费联调课包',
      packageId: original.packageId, priceVersionId: original.priceVersionId,
      policy: { version: 1, packageRefund: 'unused_paid_value', reservationRefund: 'cash',
        cancellationTiers: [{ beforeMinutes: 14400, feeBps: 0 }, { beforeMinutes: 0, feeBps: 5000 }] } });
    await api(`/ops/commerce/offers/${draft.id}/status`, admin.token, { status: 'active', version: draft.version, reason: '本地阶梯退费验收' });
    offerId = draft.id;
  }
  const input = { offerId, key };
  const pending = await api(`${root}/orders`, user.token, input);
  assert.equal(pending.status, 'pending');
  assert.equal((await api(`${root}/orders`, user.token, input)).id, pending.id);
  if (health.provider === 'wechatpay-mock') {
    const order = await record('commerce_orders', pending.id);
    const payment = await gateway(`/v1/payments/${order.data.paymentId}`);
    assert.equal(payment.action.type, 'wechatpay');
    assert.equal(payment.action.mock, true);
    assert.equal(payment.action.parameters.signType, 'RSA');
  }
  const paid = await api(`${root}/orders/${pending.id}/mock-pay`, user.token, {});
  assert.equal(paid.status, 'completed');
  const row = await record('commerce_orders', paid.id);
  if (health.provider === 'wechatpay-mock') {
    await gateway(`/_test/wechatpay/notify/${row.data.paymentId}`, 'POST', {}, true);
  }
  const batches = row.data.grantResult.batches;
  assert.ok(batches.length > 0);
  await sync(paid.id);
  const batch = () => record('credit_batches', batches[0].batchId);
  const bookingOptions = await api('/v1/student/booking-options', user.token);
  assert.ok(bookingOptions.length > 0);
  const query = new URLSearchParams({ offeringId: bookingOptions[0].offeringId,
    from: new Date(Date.now() + 2 * 86400000).toISOString(), to: new Date(Date.now() + 10 * 86400000).toISOString() });
  const availability = await api(`/v1/student/booking-slots?${query}`, user.token);
  assert.ok(availability.slots.length > 0);
  const slot = availability.slots[0];
  const appointment = await api('/v1/student/appointments', user.token, {
    offeringId: bookingOptions[0].offeringId, startAt: slot.startAt, endAt: slot.endAt, note: '支付联调预约' });
  await api(`/ops/course-bookings/appointments/${appointment.appointmentId}/confirm`, admin.token, {});
  assert.equal((await batch()).frozenQuantity, 1);
  assert.equal((await api(`${root}/orders/${paid.id}/refund-preview`, user.token)).blocked, true);
  await rejected(`${root}/orders/${paid.id}/refunds`, user.token, { key: `blocked-${key}`, expectedAmount: paid.amount }, 'REFUND_HAS_RESERVATIONS');
  let cancelledRefund = 0;
  const cancellationQuote = await api(`/v1/student/appointments/${appointment.appointmentId}/cancellation-preview`, user.token);
  const cancellation = await api(`/v1/student/appointments/${appointment.appointmentId}/cancel`, user.token, {
    reason: '支付联调取消', expectedRefundAmount: cancellationQuote.amount, expectedFee: cancellationQuote.fee });
  if (tiered) {
    assert.equal(cancellationQuote.mode, 'cash');
    assert.equal(cancellationQuote.fee, paid.amount / 8);
    const liabilityId = cancellation.refund.refundId;
    await sync(paid.id);
    const liability = await eventually(async () => {
      const value = await record('commerce_refunds', liabilityId);
      assert.ok(value.data.gatewayId, 'liability refund not yet sent');
      return value;
    });
    await gateway(`/_test/observations/${liability.data.gatewayId}`, 'POST', { status: 'failed' }, true);
    await gateway('/_test/poll', 'POST', {}, true);
    await sync(paid.id);
    assert.equal((await batch()).availableQuantity, 3);
    assert.equal((await record('commerce_orders', paid.id)).data.refundPending, true);
    await api(`/ops/commerce/refunds/${liabilityId}/retry`, admin.token, { reason: '渠道已确认失败，重试原路退款' });
    const retry = await record('commerce_refunds', liabilityId);
    await mockSuccess(retry.data.gatewayId);
    await sync(paid.id);
    assert.equal((await record('commerce_refunds', liabilityId)).status, 'succeeded');
    cancelledRefund = cancellationQuote.amount;
    const search = await api(`/ops/commerce/orders?search=${cellphone}`, admin.token);
    assert.ok(search.items.some((item) => item.id === paid.id));
  }
  assert.equal((await batch()).frozenQuantity, 0);
  const quote = await api(`${root}/orders/${paid.id}/refund-preview`, user.token);
  assert.equal(quote.amount, tiered ? paid.amount * 3 / 4 : paid.amount);
  assert.equal(quote.blocked, false);
  await rejected(`${root}/orders/${paid.id}/refunds`, user.token, { key: `stale-${key}`, expectedAmount: 1 }, 'REFUND_QUOTE_CHANGED');
  const failedRefund = await api(`${root}/orders/${paid.id}/refunds`, user.token, { key: `failure-${key}`, expectedAmount: quote.amount });
  const failedRow = await record('commerce_refunds', failedRefund.id);
  await gateway(`/_test/observations/${failedRow.data.gatewayId}`, 'POST', { status: 'failed' }, true);
  await gateway('/_test/poll', 'POST', {}, true);
  await sync(paid.id);
  assert.equal((await batch()).availableQuantity, tiered ? 3 : 4);
  assert.equal((await api(`${root}/orders/${paid.id}`, user.token)).refunded, cancelledRefund);
  const pendingRefund = tiered ? await api(`/ops/commerce/orders/${paid.id}/refunds`, admin.token,
    { key: `refund-${key}`, expectedAmount: quote.amount, reason: '管理员代学员退剩余课时' })
    : await api(`${root}/orders/${paid.id}/refunds`, user.token, { key: `refund-${key}`, expectedAmount: quote.amount });
  assert.equal(pendingRefund.status, 'processing');
  for (const grant of batches) assert.equal((await record('credit_batches', grant.batchId)).availableQuantity, 0);
  const refund = await record('commerce_refunds', pendingRefund.id);
  const restart = spawnSync(process.execPath, [new URL('./native-stack.mjs', import.meta.url).pathname, 'restart', 'pay'], { stdio: 'pipe' });
  assert.equal(restart.status, 0, 'Gateway restart must preserve pending refund');
  assert.equal((await eventually(() => gateway(`/v1/refunds/${refund.data.gatewayId}`))).status, 'processing');
  await mockSuccess(refund.data.gatewayId);
  await sync(paid.id);
  assert.equal((await api(`${root}/refunds/${refund.id}`, user.token)).status, 'succeeded');
  assert.equal((await api(`${root}/orders/${paid.id}`, user.token)).refunded, quote.amount + cancelledRefund);
  if (tiered) {
    const detail = await api(`/ops/commerce/orders/${paid.id}`, admin.token);
    assert.ok(detail.audit.some((entry) => entry.action === 'refund_requested' && entry.actorId));
    const offer = await record('commerce_offers', offerId);
    await api(`/ops/commerce/offers/${offerId}/status`, admin.token, { status: 'inactive', version: offer.version, reason: '联调完成，下架测试版本' });
  }
  await eventually(() => api('/ops/commerce/recover', admin.token, {}));
  const reconciliation = await api('/ops/commerce/reconcile', admin.token, {});
  if (health.provider === 'wechatpay-mock') {
    await gateway(`/_test/wechatpay/notify/${refund.data.gatewayId}`, 'POST', {}, true);
    const bill = await gateway(`/v1/providers/wechatpay/bills/${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}`);
    assert.equal(bill.mock, true);
    assert.ok(bill.content.includes(row.data.paymentId));
    assert.ok(bill.content.includes(refund.data.gatewayId));
  }
  console.log(JSON.stringify({ result: 'passed', orderId: paid.id, refundId: refund.id,
    appointmentId: appointment.appointmentId, grantedBatches: batches.length, amountMinor: paid.amount,
    tieredCancellation: tiered, failedRefundRestored: true, gatewayRestartRecovered: true, provider: health.provider, reconciliation }, null, 2));
}
main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
