// Stage 6: online purchase, refunds and the finance workspace.
// Commerce routes exist only when COURSE_COMMERCE_ENABLED=true; every test skips otherwise.
// Only reads and commands rejected before any write run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, COMPARE_URL, OPS_TOKEN, STAGE_HEADERS, call, ops, student } from './client.mjs';

const error = (code, message) => ({ code, message, data: null });
const TRACE = { 'X-Trace-Id': 'contract-trace' };
const failure = (code, message, errorCode, details = {}) => ({
  code, message, data: null, errorCode, details, operationId: null, traceId: TRACE['X-Trace-Id'],
});
const invalidSession = { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '未授权，请登录后操作', data: null };
const enabled = (await call('/v1/student/commerce/catalog')).body.errorCode === 'AUTH_SESSION_INVALID';
const disabled = !enabled && 'commerce is disabled on this server';
const admin = ops || OPS_TOKEN;
const reason = failure(400, '请填写2至500字的处理原因', 'COMMERCE_REASON_REQUIRED');

async function adminToken() {
  if (OPS_TOKEN) return OPS_TOKEN;
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  return profile.isAdmin && !profile.passwordChangeRequired ? token : null;
}

test('stage 6 routes require a session', { skip: disabled }, async () => {
  for (const path of ['/v1/student/commerce/orders', '/v1/student/commerce/orders/x/refund-preview', '/v1/student/commerce/refunds/x']) {
    assert.deepEqual((await call(path)).body, invalidSession, path);
  }
  assert.deepEqual((await call('/v1/student/commerce/orders', { method: 'POST', body: {} })).body, invalidSession);
  for (const path of ['/ops/commerce/finance', '/ops/commerce/orders', '/ops/commerce/offers', '/ops/commerce/cases', '/ops/commerce/statements']) {
    assert.deepEqual((await call(path)).body, error(403, '后台未登录'), path);
  }
  assert.deepEqual((await call('/ops/commerce/recover', { method: 'POST', body: {} })).body, error(403, '后台未登录'));
  // The gateway callback answers raw JSON; it is absent when PAY_EVENT_TOKEN is not configured.
  const event = await fetch(`${BASE_URL}/internal/commerce/payment-events`, { method: 'POST', body: '{}',
    headers: { ...STAGE_HEADERS, 'Content-Type': 'application/json', Authorization: 'Bearer wrong' } });
  if (event.status === 401) assert.deepEqual(await event.json(), { error: 'UNAUTHORIZED' });
  else assert.equal(event.status, 404);
});

test('ops commerce rejects invalid input', { skip: disabled || (!admin && 'CONTRACT_OPS_* not set') }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const query = (path) => call(path, { token, headers: TRACE });
  const command = (path, body) => call(path, { method: 'POST', token, body, headers: TRACE });
  assert.deepEqual((await query('/ops/commerce/orders?perPage=0')).body, failure(400, '分页参数无效', 'INVALID_PAGINATION'));
  assert.deepEqual((await query(`/ops/commerce/orders?search=${'x'.repeat(101)}`)).body, failure(400, '搜索内容过长', 'INVALID_SEARCH'));
  assert.deepEqual((await query('/ops/commerce/orders?status=bogus')).body, failure(400, '订单状态无效', 'INVALID_ORDER_STATUS'));
  assert.deepEqual((await query('/ops/commerce/orders?from=2026-02-30')).body, failure(400, '日期无效', 'INVALID_DATE_FILTER'));
  assert.deepEqual((await query('/ops/commerce/orders?from=2026-03-02&to=2026-03-01')).body,
    failure(400, '结束日期不能早于开始日期', 'INVALID_DATE_FILTER'));
  assert.deepEqual((await query('/ops/commerce/orders/__missing__')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
  assert.deepEqual((await command('/ops/commerce/orders/__missing__/refunds', {})).body, reason);
  assert.deepEqual((await command('/ops/commerce/orders/__missing__/refunds', { reason: '核对退款' })).body,
    failure(400, '请重新确认退款', 'REFUND_KEY_REQUIRED'));
  assert.deepEqual((await command('/ops/commerce/orders/__missing__/recover', { reason: '核对订单' })).body,
    failure(400, '请重新提交同步请求', 'RECOVERY_KEY_REQUIRED'));
  assert.deepEqual((await command('/ops/commerce/refunds/__missing__/retry', { reason: ' ' })).body, reason);
  assert.deepEqual((await command('/ops/commerce/offers', { name: 'x' })).body, failure(400, '请填写课程商品名称', 'OFFER_NAME_REQUIRED'));
  assert.deepEqual((await command('/ops/commerce/offers', { name: '测试商品', key: 'a b' })).body,
    failure(400, '请重新提交商品', 'OFFER_KEY_REQUIRED'));
  assert.deepEqual((await command('/ops/commerce/offers', { name: '测试商品', key: 'contract', policy: {} })).body,
    failure(400, '课程尚未发布退费规则', 'COMMERCE_POLICY_REQUIRED'));
  assert.deepEqual((await command('/ops/commerce/cases/__missing__', { note: '核对完成', status: 'bogus' })).body,
    failure(400, '处理状态无效', 'INVALID_CASE_STATUS'));
  assert.deepEqual((await command('/ops/commerce/statement-lines/__missing__/resolve', {})).body, reason);
  assert.deepEqual((await command('/ops/commerce/recovery-work/__missing__/retry', {})).body, reason);
});

test('student commerce reads and rejected commands', { skip: disabled || (!student && 'CONTRACT_STUDENT_* not set') }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const { token } = login.body.data;
  for (const path of ['/v1/student/commerce/catalog', '/v1/student/commerce/orders']) {
    const { body } = await call(path, { token });
    assert.equal(body.code, 10000, path);
    assert.ok(Array.isArray(body.data), path);
  }
  const command = (path, body) => call(path, { method: 'POST', token, body, headers: TRACE });
  assert.deepEqual((await command('/v1/student/commerce/orders', { offerId: 'x' })).body,
    failure(400, '请重新提交购买请求', 'CHECKOUT_KEY_REQUIRED'));
  assert.deepEqual((await call('/v1/student/commerce/orders/__missing__', { token, headers: TRACE })).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
});

test('stage 6 read parity', { skip: disabled || ((!COMPARE_URL || !admin) && 'COMPARE_URL or CONTRACT_OPS_* not set') }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const orders = (await call('/ops/commerce/orders?perPage=10', { token })).body.data.items;
  const paths = [
    '/ops/commerce/orders', '/ops/commerce/orders?status=completed&perPage=5', '/ops/commerce/offers', '/ops/commerce/cases',
    '/ops/commerce/finance', '/ops/commerce/statements', '/ops/commerce/recovery-work',
    ...orders.map((item) => `/ops/commerce/orders/${item.id}`),
  ];
  for (const path of paths) {
    const [left, right] = await Promise.all([call(path, { token, headers: TRACE }), call(path, { token, base: COMPARE_URL, headers: TRACE })]);
    assert.deepEqual(left.body, right.body, path);
  }
});
