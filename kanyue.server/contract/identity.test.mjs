import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIVATE_USER_FIELDS, call, ops, student, unusedCellphone } from './client.mjs';

const error = (code, message) => ({ code, message, data: null });
const sessionInvalid = (message) => ({ code: 403, errorCode: 'AUTH_SESSION_INVALID', message, data: null });

test('password login validation and unknown accounts', async () => {
  assert.deepEqual((await call('/v1/user/login', { method: 'POST', body: { cellphone: '' } })).body, error(400, '手机号和密码不能为空'));
  const unknown = await call('/v1/user/login', { method: 'POST', body: { cellphone: unusedCellphone(), password: 'wrong-password' } });
  assert.deepEqual(unknown.body, error(401, '手机号或密码错误'));
});

test('password login throttles after five failures', async () => {
  const body = { cellphone: unusedCellphone(), password: 'wrong-password' };
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await call('/v1/user/login', { method: 'POST', body })).body.code, 401);
  }
  assert.deepEqual((await call('/v1/user/login', { method: 'POST', body })).body, error(429, '登录尝试次数过多，请 15 分钟后再试'));
});

test('session guards', async () => {
  assert.deepEqual((await call('/v1/user/refresh', { method: 'POST' })).body, sessionInvalid('未授权，请登录后操作'));
  assert.deepEqual((await call('/v1/user/refresh', { method: 'POST', token: 'not-a-token' })).body, sessionInvalid('登录已失效，请重新登录'));
  assert.deepEqual((await call('/ops/auth/me')).body, error(403, '后台未登录'));
  assert.deepEqual((await call('/ops/auth/me', { token: 'not-a-token' })).body, error(403, '后台登录已过期，请重新登录'));
});

test('wechat login validation', async () => {
  assert.deepEqual((await call('/v1/user/wechat-login', { method: 'POST', body: {} })).body, error(400, '缺少微信登录凭证'));
  assert.deepEqual((await call('/v1/user/wechat-login', { method: 'POST', body: { code: 'x' } })).body, error(400, '缺少微信手机号授权信息'));
  assert.deepEqual((await call('/v1/user/wechat-role-login', { method: 'POST', body: { challenge: 'x', role: 'teacher' } })).body,
    error(400, '身份选择凭证无效'));
});

test('ops login validation', async () => {
  assert.deepEqual((await call('/ops/auth/login', { method: 'POST', body: {} })).body, error(400, '账号和密码不能为空'));
  assert.deepEqual((await call('/ops/auth/login', { method: 'POST', body: { account: unusedCellphone(), password: 'wrong-password' } })).body,
    error(401, '后台账号或密码错误'));
});

test('student session', { skip: !student && 'CONTRACT_STUDENT_* not set' }, async () => {
  const login = await call('/v1/user/login', { method: 'POST', body: { cellphone: student.account, password: student.password } });
  assert.equal(login.body.code, 10000);
  const user = login.body.data;
  assert.equal(user.role, 'student');
  assert.equal(user.isAdmin, false);
  assert.ok(user.token && user.avatarUrl !== undefined);
  for (const field of PRIVATE_USER_FIELDS) assert.equal(user[field], undefined, `login leaks ${field}`);

  const refreshed = await call('/v1/user/refresh', { method: 'POST', token: user.token });
  assert.equal(refreshed.body.code, 10000);
  assert.equal(refreshed.body.data.id, user.id);
  for (const field of PRIVATE_USER_FIELDS) assert.equal(refreshed.body.data[field], undefined, `refresh leaks ${field}`);

  const same = await call('/v1/user/update', { method: 'POST', token: user.token, body: { nickname: user.nickName } });
  assert.equal(same.body.code, 10000);
  assert.equal(same.body.data.nickName, user.nickName);
  assert.equal(same.body.data.nickname, user.nickName);
  assert.deepEqual((await call('/v1/user/update', { method: 'POST', token: user.token, body: {} })).body, error(400, '没有提供要更新的字段'));
  assert.deepEqual((await call('/ops/auth/me', { token: user.token })).body, error(403, '后台登录已过期，请重新登录'));
  assert.deepEqual((await call('/v1/user/wechat-roles', { token: user.token })).body, error(400, '当前登录未绑定微信身份'));
});

test('ops session', { skip: !ops && 'CONTRACT_OPS_* not set' }, async () => {
  const login = await call('/ops/auth/login', { method: 'POST', body: { account: ops.account, password: ops.password } });
  assert.equal(login.body.code, 10000);
  const { token, profile } = login.body.data;
  assert.deepEqual(Object.keys(profile).sort(), ['avatar', 'blocked', 'cellphone', 'courseCreditCapabilities', 'id', 'isAdmin',
    'nickName', 'passwordChangeRequired', 'realName', 'role', 'sn', 'verified']);

  const me = await call('/ops/auth/me', { token });
  assert.deepEqual(me.body, { code: 10000, message: null, data: { profile } });
  assert.deepEqual((await call('/ops/auth/change-password', { method: 'POST', token, body: { currentPassword: ops.password, newPassword: 'short' } })).body,
    error(400, '新密码至少需要 8 位'));
  assert.deepEqual((await call('/ops/auth/change-password', { method: 'POST', token, body: { currentPassword: ops.password, newPassword: ops.password } })).body,
    error(400, '新密码不能与当前密码相同'));

  if (profile.isAdmin && !profile.passwordChangeRequired) {
    const venues = await call('/ops/venues', { token });
    assert.equal(venues.body.code, 10000);
    for (const venue of venues.body.data.items) assert.ok(['active', 'inactive'].includes(venue.status));
    assert.deepEqual((await call('/ops/venues', { method: 'POST', token, body: { name: ' ' } })).body, error(400, '场馆名称不能为空'));
    assert.deepEqual((await call('/ops/venues', { method: 'POST', token, body: { name: '场馆', phone: 'abc' } })).body,
      error(400, '咨询电话只能包含数字、空格、+ 和 -'));
  }
});
