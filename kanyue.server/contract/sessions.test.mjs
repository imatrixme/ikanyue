// Stage 5: classes, lessons, calendars, attendance and settlement.
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
const day = 86400000;
const range = () => {
  const from = new Date(Date.now() - 7 * day).toISOString();
  const to = new Date(Date.now() + 21 * day).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
};
const OPS_LISTS = [
  '/ops/course-credits/classes?perPage=100', '/ops/course-credits/class-students?perPage=100',
  '/ops/course-credits/class-teachers?perPage=100', '/ops/course-credits/sessions?perPage=100',
  '/ops/course-credits/session-classes?perPage=100', '/ops/course-credits/session-students?perPage=100',
  '/ops/course-credits/session-teachers?perPage=100', '/ops/course-credits/assigned-classes',
];

test('stage 5 routes require a session', async () => {
  for (const path of ['/ops/course-credits/sessions', '/ops/course-calendar', '/ops/course-credits/assigned-lessons']) {
    assert.deepEqual((await call(path)).body, error(403, '后台未登录'), path);
  }
  for (const path of ['/ops/course-credits/sessions/x/publish', '/ops/course-operations/lessons/x/attendance/all-present']) {
    assert.deepEqual((await call(path, { method: 'POST', body: {} })).body, error(403, '后台未登录'), path);
  }
  const invalid = { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '未授权，请登录后操作', data: null };
  for (const path of ['/v1/teacher/calendar', '/v1/teacher/schedule', '/v1/schedule/upcoming']) {
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

test('ops lesson reads', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const read = async (path) => {
    const { body } = await call(path, { token });
    assert.equal(body.code, 10000, path);
    return body.data;
  };
  for (const path of OPS_LISTS) assert.deepEqual(Object.keys(await read(path)).sort(), PAGE_KEYS, path);
  const calendar = await read(`/ops/course-calendar?${range()}`);
  assert.deepEqual(Object.keys(calendar).sort(), ['facets', 'filters', 'items', 'range']);
  assert.deepEqual(Object.keys(calendar.facets).sort(), ['classes', 'courses', 'students', 'teachers']);
  assert.deepEqual(Object.keys(await read(`/ops/course-credits/assigned-lessons?${range()}`)).sort(), PAGE_KEYS);

  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/ops/course-calendar')).body, failure(400, '日历开始时间无效', 'CALENDAR_FROM_INVALID'));
  assert.deepEqual((await query('/ops/course-calendar?from=2026-01-01&to=2026-04-01')).body,
    failure(400, '日历查询范围不能超过 42 天', 'CALENDAR_RANGE_TOO_LARGE', { maxDays: 42 }));
  assert.deepEqual((await query('/ops/course-credits/sessions?from=bad')).body,
    failure(400, 'Date filter is invalid', 'OPS_FILTER_DATE_INVALID'));
  assert.deepEqual((await query('/ops/course-credits/sessions/__missing__')).body,
    failure(400, 'Course-credit resource was not found', 'OPS_RESOURCE_NOT_FOUND', { resource: 'sessions' }));
  assert.deepEqual((await query('/ops/course-operations/lessons/__missing__/settlement-preview')).body,
    failure(404, "The requested resource wasn't found.", 'COURSE_CREDIT_INTERNAL_ERROR'));
});

test('ops lesson commands reject invalid input', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const command = (path, body) => call(path, { method: 'POST', token, body, headers: TRACE });
  const keyed = (path, body) => call(path, { method: 'POST', token, body, headers: { ...TRACE, 'Idempotency-Key': 'contract-key' } });
  const missing = '/ops/course-credits/sessions/__missing__';
  assert.deepEqual((await command(`${missing}/publish`, { classIds: [] })).body,
    failure(400, 'At least one class is required', 'SESSION_CLASSES_REQUIRED'));
  assert.deepEqual((await command(`${missing}/publish`, { classIds: ['x'] })).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  assert.deepEqual((await command(`${missing}/reschedule`, { newStartAt: 'x' })).body,
    failure(400, 'New session start and end times are required', 'SESSION_TIME_INVALID'));
  assert.deepEqual((await command(`${missing}/cancel`, { reason: 'x' })).body,
    failure(400, '请填写课堂取消原因', 'SESSION_CANCEL_REASON_REQUIRED'));
  assert.deepEqual((await command(`${missing}/reverse-settlement`, { reason: 'x' })).body,
    failure(400, 'Settlement reversal requires a meaningful reason', 'REVERSAL_REASON_REQUIRED'));
  assert.deepEqual((await command('/ops/course-credits/classes/__missing__/students/x/membership', { status: 'bogus' })).body,
    failure(400, 'Student membership status is invalid', 'INVALID_MEMBERSHIP_STATUS'));
  assert.deepEqual((await command('/ops/course-credits/classes/__missing__/students/x/transfer', {})).body,
    failure(400, 'toClassId is required', 'TARGET_CLASS_ID_REQUIRED'));
  assert.deepEqual((await command('/ops/course-credits/classes/__missing__/teachers/x/assignment', { role: 'boss' })).body,
    failure(400, 'Teacher role is invalid', 'INVALID_TEACHER_ROLE'));
  assert.deepEqual((await command('/ops/course-operations/classes', { status: 'bogus' })).body,
    failure(400, '必填文本不能为空', 'CLASS_CODE_REQUIRED'));
  assert.deepEqual((await command('/ops/course-operations/lessons', { status: 'scheduled' })).body,
    failure(400, '必填文本不能为空', 'LESSON_CODE_REQUIRED'));
  assert.deepEqual((await keyed('/ops/course-operations/lessons/__missing__/students/x/attendance', { attendanceStatus: 'gone' })).body,
    failure(400, '出勤结果无效', 'ATTENDANCE_STATUS_INVALID'));
  assert.deepEqual((await command('/ops/course-operations/lessons/__missing__/attendance/all-present', {})).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
});

test('student schedule views', { skip: !student && 'CONTRACT_STUDENT_* not set' }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const { token } = login.body.data;

  const upcoming = (await call('/v1/schedule/upcoming?limit=3', { token })).body;
  assert.equal(upcoming.code, 10000);
  assert.ok(Array.isArray(upcoming.data.items));
  const query = (path) => call(path, { token, headers: TRACE });
  assert.deepEqual((await query('/v1/schedule/upcoming?limit=abc')).body,
    failure(400, '首页课程数量必须在 1 到 3 之间', 'CALENDAR_UPCOMING_LIMIT_INVALID'));
  assert.deepEqual((await query(`/v1/teacher/calendar?${range()}`)).body,
    failure(403, '仅教师可以使用预约工作台', 'BOOKING_TEACHER_REQUIRED'));
});

test('stage 5 read parity', { skip: (!COMPARE_URL || !admin) && 'COMPARE_URL or CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const sessions = (await call(`/ops/course-credits/sessions?perPage=20&${range()}`, { token })).body.data.items;
  const settled = (await call('/ops/course-credits/sessions?perPage=5&status=settled', { token })).body.data.items;
  const paths = [
    ...OPS_LISTS, `/ops/course-credits/sessions?${range()}`, `/ops/course-calendar?${range()}`,
    `/ops/course-credits/assigned-lessons?${range()}`,
    ...sessions.map((item) => `/ops/course-credits/sessions/${item.id}`),
    ...[...sessions, ...settled].map((item) => `/ops/course-credits/session-students?sessionId=${item.id}`),
    ...settled.map((item) => `/ops/course-operations/lessons/${item.id}/settlement-preview`),
  ];
  for (const path of paths) {
    const [left, right] = await Promise.all([call(path, { token, headers: TRACE }), call(path, { token, base: COMPARE_URL, headers: TRACE })]);
    assert.deepEqual(left.body, right.body, path);
  }
});
