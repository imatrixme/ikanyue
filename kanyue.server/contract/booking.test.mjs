// Stage 4: one-to-one course booking (student requests, teacher workbench,
// ops booking configuration, appointment workers).
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
const OPS_READS = [
  '/ops/course-bookings/dashboard', '/ops/course-bookings/reference-data', '/ops/course-bookings/appointments?perPage=100',
  '/ops/course-bookings/policies?perPage=100', '/ops/course-bookings/offerings?perPage=100',
  '/ops/course-bookings/availability', '/ops/course-bookings/conflicts?perPage=100',
];

test('stage 4 routes require a session', async () => {
  for (const path of ['/ops/course-bookings/dashboard', '/ops/course-bookings/appointments', '/ops/course-bookings/policies']) {
    assert.deepEqual((await call(path)).body, error(403, '后台未登录'), path);
  }
  for (const path of ['/ops/course-bookings/appointments', '/ops/course-bookings/workers/expire']) {
    assert.deepEqual((await call(path, { method: 'POST', body: {} })).body, error(403, '后台未登录'), path);
  }
  const invalid = { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '未授权，请登录后操作', data: null };
  for (const path of ['/v1/student/appointments', '/v1/teacher/booking/dashboard']) {
    assert.deepEqual((await call(path)).body, invalid, path);
  }
});

const admin = ops || OPS_TOKEN;

async function adminToken() {
  if (OPS_TOKEN) return OPS_TOKEN;
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  return profile.isAdmin && !profile.passwordChangeRequired ? token : null;
}

test('ops booking reads', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const read = async (path) => {
    const { body } = await call(path, { token });
    assert.equal(body.code, 10000, path);
    return body.data;
  };
  assert.deepEqual(Object.keys(await read('/ops/course-bookings/dashboard')).sort(),
    ['openConflictCount', 'openConflicts', 'pending', 'pendingCount', 'upcoming']);
  assert.deepEqual(Object.keys(await read('/ops/course-bookings/reference-data')).sort(),
    ['courses', 'creditTypes', 'policies', 'teachers']);
  assert.deepEqual(Object.keys(await read('/ops/course-bookings/availability')).sort(), ['overrides', 'rules']);
  for (const path of OPS_READS.filter((item) => item.includes('perPage'))) {
    assert.deepEqual(Object.keys(await read(path)).sort(), PAGE_KEYS, path);
  }
  const [appointment] = (await read('/ops/course-bookings/appointments?perPage=1')).items;
  if (appointment) {
    const detail = await read(`/ops/course-bookings/appointments/${appointment.appointmentId}`);
    assert.ok(Array.isArray(detail.events) && Array.isArray(detail.claims));
  }

  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/ops/course-bookings/appointments?status=a,b,c,d,e,f,g,h,i,j,k')).body,
    failure(400, '预约状态筛选无效', 'BOOKING_STATUS_FILTER_INVALID'));
  assert.deepEqual((await query('/ops/course-bookings/appointments?perPage=101')).body,
    failure(400, 'perPage must not exceed 100', 'PER_PAGE_INVALID'));
  assert.deepEqual((await query('/ops/course-bookings/appointments/__missing__')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
  assert.deepEqual((await query('/ops/course-bookings/students/__missing__/options')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
});

test('ops booking rejects invalid commands', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const command = (path, body, method = 'POST') => call(path, { method, token, body, headers: TRACE });

  assert.deepEqual((await command('/ops/course-bookings/appointments', {})).body,
    failure(400, '请选择学员', 'BOOKING_STUDENT_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/policies', {})).body,
    failure(400, '策略编码不能为空', 'BOOKING_POLICY_CODE_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/policies', { code: 'x', name: 'x', status: 'gone' })).body,
    failure(400, '策略状态无效', 'BOOKING_POLICY_STATUS_INVALID'));
  assert.deepEqual((await command('/ops/course-bookings/offerings', {})).body,
    failure(400, '缺少 teacherId', 'BOOKING_OFFERING_FIELD_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/offerings/__missing__', { teacherId: 'x', courseSpecId: 'x', creditTypeId: 'x', policyId: 'x', status: 'x' }, 'PATCH')).body,
    failure(400, '课程预约状态无效', 'BOOKING_OFFERING_STATUS_INVALID'));
  assert.deepEqual((await command('/ops/course-bookings/offerings/__missing__/availability', { rules: [] }, 'PUT')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
  assert.deepEqual((await command('/ops/course-bookings/conflicts/__missing__/resolve', { resolution: '好' })).body,
    failure(400, '请填写明确的处理结果', 'BOOKING_CONFLICT_RESOLUTION_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/appointments/__missing__/cancel', {})).body,
    failure(400, '请填写取消原因', 'APPOINTMENT_CANCEL_REASON_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/appointments/__missing__/reschedule', { newStartAt: 'x' })).body,
    failure(400, '改期时间无效', 'APPOINTMENT_TIME_INVALID'));
  assert.deepEqual((await command('/ops/course-bookings/appointments/__missing__/decline', { reason: '时间冲突' })).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  assert.deepEqual((await command('/ops/course-bookings/workers/expire', {})).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
});

test('student booking views', { skip: !student && 'CONTRACT_STUDENT_* not set' }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const { token } = login.body.data;

  const options = (await call('/v1/student/booking-options', { token })).body;
  assert.equal(options.code, 10000);
  assert.ok(Array.isArray(options.data));
  const appointments = (await call('/v1/student/appointments', { token })).body;
  assert.equal(appointments.code, 10000);
  assert.deepEqual(Object.keys(appointments.data).sort(), PAGE_KEYS);

  const query = (path) => call(path, { token, headers: TRACE });
  const command = (path, body) => call(path, { method: 'POST', token, body, headers: TRACE });
  assert.deepEqual((await query('/v1/student/booking-slots')).body, failure(400, '编号不能为空', 'BOOKING_OFFERING_REQUIRED'));
  assert.deepEqual((await query('/v1/student/booking-options?courseId=__missing__')).body,
    failure(400, '当前课程没有可预约课时', 'BOOKING_COURSE_NOT_ELIGIBLE'));
  assert.deepEqual((await command('/v1/student/appointments', {})).body, failure(400, '预约信息不完整', 'BOOKING_OFFERING_REQUIRED'));
  assert.deepEqual((await command('/v1/student/appointments/__missing__/withdraw', {})).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  assert.deepEqual((await command('/v1/student/appointments/__missing__/cancel', { reason: 'x' })).body,
    failure(400, '请填写取消原因', 'APPOINTMENT_CANCEL_REASON_REQUIRED'));
  assert.deepEqual((await query('/v1/teacher/booking/dashboard')).body,
    failure(403, '仅教师可以使用预约工作台', 'BOOKING_TEACHER_REQUIRED'));
});

test('stage 4 read parity', { skip: (!COMPARE_URL || !admin) && 'COMPARE_URL or CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const appointments = (await call('/ops/course-bookings/appointments?perPage=100', { token })).body.data.items;
  const offerings = (await call('/ops/course-bookings/offerings?perPage=100', { token })).body.data.items;
  const studentIds = [...new Set(appointments.map((item) => item.student.studentId))].slice(0, 10);
  const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  const paths = [
    ...OPS_READS,
    ...appointments.slice(0, 20).map((item) => `/ops/course-bookings/appointments/${item.appointmentId}`),
    ...studentIds.map((id) => `/ops/course-bookings/students/${id}/options`),
    ...studentIds.flatMap((id) => offerings.map((offering) => (
      `/ops/course-bookings/students/${id}/slots?offeringId=${offering.id}&from=${from}T00:00:00.000Z&to=${to}T00:00:00.000Z`))),
  ];
  for (const path of paths) {
    const [left, right] = await Promise.all([call(path, { token }), call(path, { token, base: COMPARE_URL })]);
    assert.deepEqual(left.body, right.body, path);
  }
});
