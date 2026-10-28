// Stage 3: the course-credit ledger (grants, enrollment, batch lifecycle,
// expiry, reconciliation, ledger reads) and the student learning views.
// Only reads and commands rejected before any write run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARE_URL, OPS_TOKEN, call, ops, student } from './client.mjs';

const error = (code, message) => ({ code, message, data: null });
const TRACE = { 'X-Trace-Id': 'contract-trace' };
const failure = (code, message, errorCode, details = {}) => ({
  code, message, data: null, errorCode, details, operationId: null, traceId: TRACE['X-Trace-Id'],
});
const PAGE_KEYS = ['items', 'page', 'perPage', 'totalItems', 'totalPages'];

const RESOURCES = {
  '/ops/course-credits/orders': ['cancelledAt', 'channel', 'created', 'currency', 'grantSnapshot', 'id', 'listAmount', 'orderNo', 'paidAmount', 'paidAt', 'payerId', 'priceVersionId', 'productSnapshot', 'status', 'studentId', 'type', 'updated', 'version'],
  '/ops/course-credits/enrollments': ['actorId', 'actorRole', 'created', 'id', 'operationNo', 'requestSnapshot', 'resultSnapshot', 'sourceId', 'status', 'studentId', 'traceId', 'updated'],
  '/ops/course-credits/reconciliation/runs': ['created', 'differenceCount', 'finishedAt', 'id', 'scope', 'startedAt', 'status'],
  '/ops/course-credits/reconciliation/exceptions': ['actualValue', 'batchId', 'code', 'created', 'detectedAt', 'expectedValue', 'field', 'id', 'runId', 'status'],
  '/ops/course-credits/audit-logs': ['action', 'actorId', 'actorRole', 'created', 'id', 'metadata', 'outcome', 'resourceId', 'resourceType'],
};
const ACCOUNT_KEYS = ['availableQuantity', 'batchCount', 'consumedQuantity', 'expiredQuantity', 'frozenQuantity', 'studentId', 'unactivatedQuantity'];

test('stage 3 routes require a session', async () => {
  const paths = ['/ops/course-credits/orders', '/ops/course-credits/accounts', '/ops/course-credits/settlement-exceptions',
    '/ops/course-operations/enrollments/x/sync-preview'];
  for (const path of paths) assert.deepEqual((await call(path)).body, error(403, '后台未登录'), path);
  for (const path of ['/ops/course-credits/orders/x/grant', '/ops/course-credits/workers/expiry/run', '/ops/course-operations/enrollments']) {
    assert.deepEqual((await call(path, { method: 'POST', body: {} })).body, error(403, '后台未登录'), path);
  }
  const learning = await call('/v1/student/learning/overview');
  assert.deepEqual(learning.body, { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '未授权，请登录后操作', data: null });
});

const admin = ops || OPS_TOKEN;

async function adminToken() {
  if (OPS_TOKEN) return OPS_TOKEN;
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  return profile.isAdmin && !profile.passwordChangeRequired ? token : null;
}

test('ledger reads', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');

  for (const [path, fields] of Object.entries(RESOURCES)) {
    const { body } = await call(`${path}?perPage=20`, { token });
    assert.equal(body.code, 10000, path);
    assert.deepEqual(Object.keys(body.data).sort(), PAGE_KEYS, path);
    for (const item of body.data.items) assert.deepEqual(Object.keys(item).sort(), fields, path);
    const [first] = body.data.items;
    if (first) assert.deepEqual((await call(`${path}/${first.id}`, { token })).body.data, first, path);
  }

  const accounts = (await call('/ops/course-credits/accounts?perPage=100', { token })).body;
  assert.equal(accounts.code, 10000);
  for (const item of accounts.data.items) assert.deepEqual(Object.keys(item).sort(), ACCOUNT_KEYS);
  const [account] = accounts.data.items;
  if (account) {
    const detail = (await call(`/ops/course-credits/accounts/${account.studentId}`, { token })).body.data;
    assert.equal(detail.availableQuantity, account.availableQuantity);
    assert.ok(Array.isArray(detail.batches) && Array.isArray(detail.events));
    const overview = (await call(`/ops/course-credits/student-overview?studentIds=${account.studentId}`, { token })).body.data;
    assert.deepEqual(Object.keys(overview.items[0]).sort(), [...ACCOUNT_KEYS, 'followUp', 'nextLesson'].sort());
  }
  const exceptions = (await call('/ops/course-credits/settlement-exceptions', { token })).body;
  assert.equal(exceptions.code, 10000);
  assert.deepEqual(Object.keys(exceptions.data).sort(), PAGE_KEYS);

  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/ops/course-credits/student-overview')).body,
    failure(400, '请提供 1 到 100 个学员编号', 'STUDENT_IDS_INVALID'));
  assert.deepEqual((await query('/ops/course-credits/orders?status=gone')).body,
    failure(400, 'Resource status filter is invalid', 'OPS_FILTER_STATUS_INVALID'));
  assert.deepEqual((await query('/ops/course-credits/enrollments/__missing__')).body,
    failure(400, 'Course-credit resource was not found', 'OPS_RESOURCE_NOT_FOUND', { resource: 'enrollments' }));
  assert.deepEqual((await query('/ops/course-operations/enrollments/__missing__/sync-preview')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
});

test('ledger rejects invalid commands', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const command = (path, body, headers = {}) => call(path, { method: 'POST', token, body, headers: { ...TRACE, ...headers } });

  const grant = (await command('/ops/course-credits/orders/__missing__/grant')).body;
  assert.ok(['IDEMPOTENCY_KEY_REQUIRED', 'COURSE_CREDIT_FEATURE_DISABLED'].includes(grant.errorCode), grant.errorCode);
  if (grant.errorCode === 'IDEMPOTENCY_KEY_REQUIRED') {
    assert.deepEqual(grant, failure(400, 'idempotency key is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  }
  assert.deepEqual((await command('/ops/course-credits/batches/__missing__/extend', {})).body,
    failure(400, 'An audit reason is required', 'AUDIT_REASON_REQUIRED'));
  assert.deepEqual((await command('/ops/course-credits/batches/__missing__/extend', { reason: 'x', newExpiresAt: '2001-01-01' })).body,
    failure(400, 'newExpiresAt must be in the future', 'EXPIRY_MUST_BE_FUTURE'));
  assert.deepEqual((await command('/ops/course-credits/batches/__missing__/restore-expired', { reason: 'x', quantity: 1.5 })).body,
    failure(400, 'Restored quantity must be a positive integer', 'INVALID_CREDIT_QUANTITY'));
  assert.deepEqual((await command('/ops/course-credits/workers/expiry/run', { limit: 0 })).body,
    failure(400, 'Expiry limit must be between 1 and 200', 'EXPIRY_LIMIT_INVALID'));
  assert.deepEqual((await command('/ops/course-credits/reconciliation/runs', { scope: 'all' })).body,
    failure(400, 'Reconciliation scope must be full or incremental', 'RECONCILIATION_SCOPE_INVALID'));
  assert.deepEqual((await command('/ops/course-credits/reconciliation/runs', { scope: 'incremental' })).body,
    failure(400, 'Incremental reconciliation requires a valid since timestamp', 'RECONCILIATION_SINCE_REQUIRED'));
  assert.deepEqual((await command('/ops/course-operations/enrollments', 'not-an-object')).body,
    failure(400, '请求体必须是 JSON 对象', 'INVALID_JSON_BODY'));
  assert.deepEqual((await command('/ops/course-operations/enrollments', { studentId: 'x' })).body,
    failure(400, 'packageId不能为空', 'PACKAGE_ID_REQUIRED'));
  assert.deepEqual((await command('/ops/course-operations/enrollments', { studentId: 'x', packageId: 'x', priceVersionId: 'x' })).body,
    failure(400, 'idempotencyKey不能为空', 'IDEMPOTENCY_KEY_REQUIRED'));
  assert.deepEqual((await command('/ops/course-operations/enrollments/__missing__/sync', {})).body,
    failure(400, '编号不能为空', 'SYNC_PREVIEW_HASH_REQUIRED'));
});

test('student learning views', { skip: !student && 'CONTRACT_STUDENT_* not set' }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const { token } = login.body.data;

  const overview = (await call('/v1/student/learning/overview', { token })).body;
  assert.equal(overview.code, 10000);
  assert.deepEqual(Object.keys(overview.data), ['nextLesson', 'upcomingLessons', 'courses', 'warnings', 'recentRecords']);
  for (const path of ['/v1/student/learning/lessons?scope=upcoming', '/v1/student/learning/records']) {
    const { body } = await call(path, { token });
    assert.equal(body.code, 10000, path);
    assert.deepEqual(Object.keys(body.data), ['page', 'perPage', 'totalItems', 'totalPages', 'items'], path);
  }
  const [course] = overview.data.courses;
  if (course) assert.equal((await call(`/v1/student/learning/courses/${course.courseId}`, { token })).body.data.courseId, course.courseId);
  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/v1/student/learning/lessons?scope=past')).body,
    failure(400, '课程日程筛选无效', 'LEARNING_LESSON_SCOPE_INVALID'));
  assert.deepEqual((await query('/v1/student/learning/lessons/__missing__')).body,
    failure(400, '未找到这节课', 'LEARNING_LESSON_NOT_FOUND'));
});

test('stage 3 read parity', { skip: (!COMPARE_URL || !admin) && 'COMPARE_URL or CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const accounts = (await call('/ops/course-credits/accounts?perPage=100', { token })).body.data.items;
  const studentIds = accounts.slice(0, 20).map((item) => item.studentId);
  const paths = [
    ...Object.keys(RESOURCES).map((path) => `${path}?perPage=100`),
    '/ops/course-credits/accounts?perPage=100',
    '/ops/course-credits/settlement-exceptions?perPage=100',
    ...(studentIds.length ? [`/ops/course-credits/student-overview?studentIds=${studentIds.join(',')}`] : []),
    ...studentIds.map((id) => `/ops/course-credits/accounts/${id}`),
  ];
  for (const path of paths) {
    const [left, right] = await Promise.all([call(path, { token }), call(path, { token, base: COMPARE_URL })]);
    assert.deepEqual(left.body, right.body, path);
  }
});
