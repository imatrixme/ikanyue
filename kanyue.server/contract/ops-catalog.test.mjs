// Stage 2: admin student directory, renewal follow-ups and the ops course catalog.
// Only reads and rejected commands run here, so business data never changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARE_URL, OPS_TOKEN, call, ops } from './client.mjs';

const error = (code, message) => ({ code, message, data: null });
const TRACE = { 'X-Trace-Id': 'contract-trace' };
const failure = (code, message, errorCode, details = {}) => ({
  code, message, data: null, errorCode, details, operationId: null, traceId: TRACE['X-Trace-Id'],
});

const CATALOG = {
  '/ops/course-credits/catalog/course-specs': ['code', 'created', 'defaultCreditTypeId', 'deliveryMode', 'durationMinutes', 'id', 'name', 'status', 'teacherTier', 'updated'],
  '/ops/course-credits/catalog/credit-types': ['code', 'consumable', 'courseSpecId', 'created', 'id', 'kind', 'name', 'referenceUnitValue', 'status', 'unitLabel', 'updated'],
  '/ops/course-credits/packages': ['activationDeadlineDays', 'activationMode', 'code', 'created', 'description', 'expiryPolicy', 'id', 'name', 'saleChannel', 'status', 'updated', 'validityDurationDays'],
  '/ops/course-credits/package-grant-lines': ['created', 'creditTypeId', 'id', 'packageId', 'quantity', 'updated'],
  '/ops/course-credits/price-versions': ['created', 'currency', 'id', 'listAmount', 'packageId', 'saleAmount', 'status', 'validFrom', 'validTo', 'version'],
};

test('stage 2 routes require an ops session', async () => {
  for (const path of ['/ops/students', '/ops/course-credits/packages', '/ops/course-credits/students/x/follow-ups']) {
    assert.deepEqual((await call(path)).body, error(403, '后台未登录'), path);
  }
  assert.deepEqual((await call('/ops/course-operations/packages', { method: 'POST', body: {} })).body, error(403, '后台未登录'));
});

const admin = ops || OPS_TOKEN;

async function adminToken() {
  if (OPS_TOKEN) return OPS_TOKEN;
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  return profile.isAdmin && !profile.passwordChangeRequired ? token : null;
}

test('admin student directory', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');

  const list = await call('/ops/students?perPage=5&sort=name-asc', { token });
  assert.equal(list.body.code, 10000);
  assert.deepEqual(Object.keys(list.body.data.pagination).sort(), ['page', 'perPage', 'totalItems', 'totalPages']);
  assert.equal(list.body.data.pagination.perPage, 5);
  for (const item of list.body.data.items) {
    assert.deepEqual(Object.keys(item).sort(), ['avatar', 'blocked', 'cellphone', 'created', 'id', 'lastLoginAt', 'nickName', 'realName', 'updated']);
  }
  assert.deepEqual((await call('/ops/students', { method: 'POST', token, body: {} })).body, error(400, '手机号不能为空'));
  assert.deepEqual((await call('/ops/students/__missing__', { method: 'POST', token, body: {} })).body,
    error(404, "The requested resource wasn't found."));
});

test('ops course catalog reads', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');

  for (const [path, fields] of Object.entries(CATALOG)) {
    const { body } = await call(`${path}?perPage=100`, { token });
    assert.equal(body.code, 10000, path);
    assert.deepEqual(Object.keys(body.data).sort(), ['items', 'page', 'perPage', 'totalItems', 'totalPages'], path);
    for (const item of body.data.items) assert.deepEqual(Object.keys(item).sort(), fields, path);
    const [first] = body.data.items;
    if (first) assert.deepEqual((await call(`${path}/${first.id}`, { token })).body.data, first, path);
  }
  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/ops/course-credits/packages?status=gone')).body,
    failure(400, 'Resource status filter is invalid', 'OPS_FILTER_STATUS_INVALID'));
  assert.deepEqual((await query('/ops/course-credits/packages?perPage=101')).body,
    failure(400, 'perPage must not exceed 100', 'PER_PAGE_INVALID'));
  assert.deepEqual((await query('/ops/course-credits/price-versions/__missing__')).body,
    failure(400, 'Course-credit resource was not found', 'OPS_RESOURCE_NOT_FOUND', { resource: 'priceVersions' }));
  assert.deepEqual((await query('/ops/course-credits/students/__missing__/follow-ups')).body,
    { code: 10000, message: null, data: { items: [] } });
});

test('ops course catalog rejects invalid commands', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const command = (path, method, body) => call(path, { method, token, body, headers: TRACE });

  assert.deepEqual((await command('/ops/course-operations/packages', 'POST', 'not-an-object')).body,
    failure(400, '请求体必须是 JSON 对象', 'INVALID_JSON_BODY'));
  assert.deepEqual((await command('/ops/course-operations/packages', 'POST', { zeta: 1, code: 'x', alpha: 2 })).body,
    failure(400, '请求包含不支持的字段', 'ADMIN_RESOURCE_FIELD_INVALID', { fields: ['zeta', 'alpha'] }));
  assert.deepEqual((await command('/ops/course-operations/course-specs', 'POST', { code: 'x' })).body,
    failure(400, '必填文本不能为空', 'COURSE_NAME_REQUIRED'));
  assert.deepEqual((await command('/ops/course-operations/price-versions/__missing__/status', 'POST', { status: 'gone' })).body,
    failure(400, '资源状态无效', 'ADMIN_RESOURCE_STATUS_INVALID', { status: 'gone' }));
  assert.deepEqual((await command('/ops/course-operations/course-specs/__missing__', 'PATCH', {})).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
  assert.deepEqual((await command('/ops/course-credits/students/__missing__/follow-ups', 'POST', { status: 'maybe' })).body,
    failure(400, '跟进结果无效', 'FOLLOW_UP_STATUS_INVALID'));
  assert.deepEqual((await command('/ops/course-credits/students/__missing__/follow-ups', 'POST', { status: 'contacted', snoozeUntil: '2020-01-01' })).body,
    failure(400, '下次提醒日期必须晚于现在', 'FOLLOW_UP_SNOOZE_INVALID'));
});

test('stage 2 read parity', { skip: (!COMPARE_URL || !admin) && 'COMPARE_URL or CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const paths = ['/ops/students?perPage=100', '/ops/students?status=inactive', ...Object.keys(CATALOG).map((path) => `${path}?perPage=100`)];
  for (const path of paths) {
    const [left, right] = await Promise.all([call(path, { token }), call(path, { token, base: COMPARE_URL })]);
    assert.deepEqual(left.body, right.body, path);
  }
});
