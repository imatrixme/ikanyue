const test = require('node:test');
const assert = require('node:assert/strict');

const {
    WechatIdentityService,
    isAvailablePrincipal,
    normalizeCapabilities,
    roleOption,
    validatePrincipal,
} = require('../src/services/courseCredits/booking/wechatIdentityService');

test('verified teacher discovery and principal issuance persist identity and trusted capabilities', async () => {
    const client = identityClient();
    const jwt = jwtMock();
    const service = createService(client, jwt);
    const teacher = await service.findTeacherByCellphone('13800138000');
    const result = await service.issuePrincipal({}, 'teacher', teacher, { openid: 'openid', unionid: 'unionid' });
    assert.equal(result.role, 'teacher');
    assert.deepEqual(result.courseCreditCapabilities, ['course_credit.teacher']);
    assert.equal(result.token, 'signed-token');
    assert.equal(client.createdIdentity.principalType, 'teacher');
    assert.deepEqual(jwt.lastClaims.courseCreditCapabilities, ['course_credit.teacher']);
});

test('role challenge only allows its signed student and teacher principals', async () => {
    const client = identityClient();
    const jwt = jwtMock();
    const service = createService(client, jwt);
    const challenge = service.createRoleChallenge({}, {
        candidates: [
            { role: 'student', record: student() },
            { role: 'teacher', record: teacher() },
        ],
        cellphone: '13800138000', openid: 'openid', unionid: 'unionid',
    });
    assert.equal(challenge.requiresRoleSelection, true);
    assert.deepEqual(challenge.roles.map((item) => item.role), ['student', 'teacher']);
    jwt.checked = jwt.lastClaims;
    const selected = await service.completeRoleChallenge({}, challenge.challenge, 'teacher');
    assert.equal(selected.id, 'teacher');
    await assert.rejects(service.completeRoleChallenge({}, challenge.challenge, 'guardian'),
        hasCode('WECHAT_ROLE_NOT_AVAILABLE'));
});

test('bound identities can be listed and switched without trusting client principal ids', async () => {
    const client = identityClient({ identities: [
        { id: 'identity-student', principalType: 'student', principalId: 'student', unionId: 'unionid' },
        { id: 'identity-teacher', principalType: 'teacher', principalId: 'teacher', unionId: 'unionid' },
    ] });
    const jwt = jwtMock();
    const service = createService(client, jwt);
    const roles = await service.listRoles('openid');
    assert.deepEqual(roles.map((item) => item.role), ['student', 'teacher']);
    const switched = await service.switchRole({}, 'openid', 'student');
    assert.equal(switched.role, 'student');
    assert.equal(switched.id, 'student');
    await assert.rejects(service.switchRole({}, 'openid', 'guardian'), hasCode('WECHAT_ROLE_INVALID'));
});

test('identity validation rejects blocked or unverified principals and normalizes capability arrays', () => {
    assert.throws(() => validatePrincipal('teacher', teacher({ verified: false })), /尚未通过审核/);
    assert.throws(() => validatePrincipal('student', student({ blocked: true })), /已停用/);
    assert.deepEqual(normalizeCapabilities(['course_credit.teacher', '', 'course_credit.teacher', 1]),
        ['course_credit.teacher']);
});

test('identity edge paths reject stale challenges and skip unavailable bound principals', async () => {
    const client = identityClient({ identities: [
        { id: 'identity-unknown', principalType: 'guardian', principalId: 'student', unionId: '' },
    ] });
    const jwt = jwtMock();
    const service = createService(client, jwt);
    assert.equal(await service.bindIdentity('student', 'student', {}), null);
    assert.deepEqual(await service.listRoles('openid'), []);
    await assert.rejects(service.listRoles(''), hasCode('WECHAT_IDENTITY_REQUIRED'));
    assert.throws(() => service.createRoleChallenge({}, { candidates: [] }),
        hasCode('WECHAT_ROLE_CHALLENGE_NOT_REQUIRED'));

    jwt.checked = { challengeType: 'other' };
    await assert.rejects(service.completeRoleChallenge({}, 'challenge', 'student'),
        hasCode('WECHAT_ROLE_CHALLENGE_INVALID'));
    jwt.checked = {
        challengeType: 'wechat-role-selection', challengeExpiresAt: Math.floor(NOW / 1000),
        roles: ['student'], principals: { student: 'student' }, openid: 'openid',
    };
    await assert.rejects(service.completeRoleChallenge({}, 'challenge', 'student'),
        hasCode('WECHAT_ROLE_CHALLENGE_EXPIRED'));
});

test('student principal issuance and identity update use server-side role facts', async () => {
    const client = identityClient({ identities: [
        { id: 'identity-student', principalType: 'student', principalId: 'student', unionId: 'old-union' },
    ] });
    const jwt = jwtMock();
    const service = createService(client, jwt);
    const issued = await service.issuePrincipal({}, 'student', student(), {
        openid: 'openid', unionid: 'new-union',
    });
    assert.equal(issued.isAdmin, false);
    assert.deepEqual(issued.courseCreditCapabilities, []);
    assert.equal(client.updatedIdentity.unionId, 'new-union');
    assert.equal(isAvailablePrincipal('guardian', student()), false);
    assert.equal(roleOption('teacher', { id: 'teacher' }).name, '教师');
    assert.equal(roleOption('student', { id: 'student' }).name, '学员');
    assert.deepEqual(normalizeCapabilities(null), []);
});

const NOW = 1785542400000;

function createService(client, jwt) {
    return new WechatIdentityService(client, {
        appId: 'wx-app', clock: () => NOW, jwt,
    });
}

function identityClient(options = {}) {
    const identities = options.identities || [];
    const client = {
        createdIdentity: null,
        updatedIdentity: null,
        collection(name) {
            if (name === 'teachers') return {
                async getList() { return { items: [teacher()] }; },
                async getOne() { return teacher(); },
            };
            if (name === 'students') return { async getOne() { return student(); } };
            if (name === 'wechat_identities') return {
                async getFirstListItem(filter) {
                    const role = filter.includes('principalType="teacher"') ? 'teacher' : 'student';
                    const match = identities.find((item) => item.principalType === role);
                    if (!match) throw Object.assign(new Error('not found'), { status: 404 });
                    return match;
                },
                async getFullList() { return identities; },
                async create(data) {
                    const created = { id: 'identity-created', ...data };
                    client.createdIdentity = created;
                    return created;
                },
                async update(id, data) {
                    const updated = { id, ...data };
                    client.updatedIdentity = updated;
                    return updated;
                },
            };
            throw new Error(`Unexpected collection ${name}`);
        },
    };
    return client;
}

function jwtMock() {
    return {
        lastClaims: null,
        checked: null,
        sign(_request, _id, _sn, _role, _isAdmin, claims) {
            this.lastClaims = claims;
            return 'signed-token';
        },
        check() { return this.checked; },
    };
}

function teacher(changes = {}) {
    return {
        id: 'teacher', sn: 'teacher-sn', realName: '林老师', verified: true, blocked: false,
        courseCreditCapabilities: ['course_credit.teacher'], ...changes,
    };
}

function student(changes = {}) {
    return { id: 'student', sn: 'student-sn', realName: '学员甲', blocked: false, ...changes };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
