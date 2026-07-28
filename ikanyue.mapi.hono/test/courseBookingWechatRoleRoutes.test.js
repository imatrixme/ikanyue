const test = require('node:test');
const assert = require('node:assert/strict');

const { createWechatRoleHandlers } = require('../src/routes/user/wechatRole');

test('wechat role handlers complete a challenge, list bound roles, and switch by token identity', async () => {
    const calls = [];
    class IdentityService {
        async completeRoleChallenge(_request, challenge, role) {
            calls.push(['complete', challenge, role]);
            return { role, token: 'token' };
        }
        async listRoles(openid) { calls.push(['list', openid]); return [{ role: 'student' }]; }
        async switchRole(_request, openid, role) {
            calls.push(['switch', openid, role]);
            return { role, token: 'switched' };
        }
    }
    const handlers = createWechatRoleHandlers({ client: {}, IdentityService });
    assert.deepEqual(await handlers.wechatRoleLoginHandler(context({ body: {
        challenge: 'challenge', role: 'teacher',
    } })), { data: { role: 'teacher', token: 'token' } });
    assert.deepEqual(await handlers.listWechatRolesHandler(context({
        user: { wechatOpenId: 'openid' },
    })), { data: [{ role: 'student' }] });
    assert.deepEqual(await handlers.switchWechatRoleHandler(context({
        body: { role: 'student' }, user: { wechatOpenId: 'openid' },
    })), { data: { role: 'student', token: 'switched' } });
    assert.deepEqual(calls, [
        ['complete', 'challenge', 'teacher'], ['list', 'openid'], ['switch', 'openid', 'student'],
    ]);
});

test('wechat role handlers map unavailable principals to forbidden and other failures to bad request', async () => {
    class IdentityService {
        async completeRoleChallenge() {
            throw Object.assign(new Error('教师不可用'), { code: 'WECHAT_PRINCIPAL_UNAVAILABLE' });
        }
        async listRoles() { throw new Error('查询失败'); }
        async switchRole() { throw new Error('切换失败'); }
    }
    const handlers = createWechatRoleHandlers({ client: {}, IdentityService });
    assert.deepEqual(await handlers.wechatRoleLoginHandler(context()), { status: 403, message: '教师不可用' });
    assert.deepEqual(await handlers.listWechatRolesHandler(context()), { status: 400, message: '查询失败' });
    assert.deepEqual(await handlers.switchWechatRoleHandler(context()), { status: 400, message: '切换失败' });
});

function context(options = {}) {
    return {
        req: { async json() { return options.body || {}; } },
        get() { return options.user; },
        data(value) { return { data: value }; },
        error(status, message) { return { status, message }; },
    };
}
