// Owner workbench (OpenSpec add-owner-workbench): the mini program teacher
// workbench whose sections follow the teacher's permissions.
// Only reads and commands rejected before any write run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPS_TOKEN, call, ops, student } from './client.mjs';

const TRACE = { 'X-Trace-Id': 'contract-trace' };
const failure = (code, message, errorCode, details = {}) => ({
  code, message, data: null, errorCode, details, operationId: null, traceId: TRACE['X-Trace-Id'],
});
const READS = ['/v1/workbench/summary', '/v1/workbench/lessons/pending', '/v1/workbench/students', '/v1/workbench/packages'];
const COMMANDS = ['/v1/workbench/lessons/__missing__/confirm', '/v1/workbench/lessons/__missing__/reverse',
  '/v1/workbench/students', '/v1/workbench/students/__missing__/grants'];

test('workbench routes require a session', async () => {
  const invalid = { code: 403, errorCode: 'AUTH_SESSION_INVALID', message: '未授权，请登录后操作', data: null };
  for (const path of [...READS, '/v1/workbench/students/__missing__/ledger']) {
    assert.deepEqual((await call(path)).body, invalid, path);
  }
  for (const path of COMMANDS) {
    assert.deepEqual((await call(path, { method: 'POST', body: {} })).body, invalid, path);
  }
});

test('students cannot open the workbench', { skip: !student && 'CONTRACT_STUDENT_* not set' }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const { token } = login.body.data;
  assert.deepEqual((await call('/v1/workbench/summary', { token, headers: TRACE })).body,
    failure(403, '仅教师可以使用工作台', 'COURSE_CREDIT_CAPABILITY_REQUIRED', { capability: 'course_credit.teacher' }));
});

const admin = ops || OPS_TOKEN;

async function adminToken() {
  if (OPS_TOKEN) return OPS_TOKEN;
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  return profile.isAdmin && !profile.passwordChangeRequired ? token : null;
}

test('owner workbench reads', { skip: !admin && 'CONTRACT_OPS_* not set' }, async (t) => {
  const token = await adminToken();
  if (!token) return t.skip('CONTRACT_OPS_* is not a ready admin');
  const read = async (path) => {
    const { body } = await call(path, { token });
    assert.equal(body.code, 10000, path);
    return body.data;
  };
  const summary = await read('/v1/workbench/summary');
  assert.deepEqual(Object.keys(summary).sort(), ['pendingLessonCount', 'pendingRequestCount', 'permissions', 'teacherCount']);
  assert.deepEqual(Object.keys(summary.permissions).sort(), ['allLessons', 'grant', 'manageStudents', 'teach', 'undo']);
  assert.equal(summary.permissions.manageStudents, true);
  assert.ok(summary.teacherCount >= 1);
  assert.ok(Array.isArray((await read('/v1/workbench/lessons/pending')).items));
  const { items: students } = await read('/v1/workbench/students?perPage=1');
  for (const item of (await read('/v1/workbench/packages')).items) {
    assert.deepEqual(Object.keys(item).sort(), ['grants', 'name', 'packageId', 'prices', 'validityDurationDays']);
    assert.ok(item.prices.length > 0 && item.grants.length > 0);
  }
  if (students[0]) {
    const ledger = await read(`/v1/workbench/students/${students[0].id}/ledger`);
    assert.deepEqual(Object.keys(ledger).sort(), ['confirmedLessons', 'overview', 'records', 'student']);
  }

  const command = (path, body) => call(path, { method: 'POST', token, body, headers: TRACE });
  assert.deepEqual((await command('/v1/workbench/lessons/__missing__/confirm', {})).body,
    failure(400, 'idempotencyKey is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  assert.deepEqual((await command('/v1/workbench/lessons/__missing__/reverse', { reason: '短' })).body,
    failure(400, 'Settlement reversal requires a meaningful reason', 'REVERSAL_REASON_REQUIRED'));
  assert.deepEqual((await command('/v1/workbench/students/__missing__/grants', {})).body,
    failure(400, 'packageId不能为空', 'PACKAGE_ID_REQUIRED'));
});
