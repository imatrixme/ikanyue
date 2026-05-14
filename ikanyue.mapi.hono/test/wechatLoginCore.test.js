const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLoginBody,
    createBaseMocks,
    createWechatLoginApp,
    loadWechatLoginHandler,
    postWechatLogin,
    runWechatLoginWithMocks,
} = require('./support/wechatLoginHelpers');

test('wechat login reuses an existing student when create hits a duplicate constraint', async () => {
    const baseStudent = {
        id: 'student_1',
        sn: 'sn_1',
        cellphone: '13800138000',
        nickName: '',
        nickname: '',
        avatar: '',
        gender: '',
        age: '',
        blocked: false,
    };
    const filters = [];
    let createCalled = 0;
    let updateCalled = 0;

    const pocketbaseMock = {
        collection(name) {
            assert.equal(name, 'students');
            return {
                async getList(_page, _perPage, options = {}) {
                    filters.push(options.filter || '');
                    return filters.length <= 2 ? { items: [] } : { items: [baseStudent] };
                },
                async create() {
                    createCalled += 1;
                    const duplicateError = new Error('value must be unique');
                    duplicateError.response = { data: { cellphone: { code: 'validation_not_unique' } } };
                    throw duplicateError;
                },
                async update(id, data) {
                    updateCalled += 1;
                    return { ...baseStudent, ...data, id };
                },
            };
        },
    };
    const jwtAuthMock = { jwtAuth: { sign: () => 'jwt-token' } };
    const wechatMock = {
        async exchangeCodeForSession() {
            return { openid: 'openid_1', unionid: 'unionid_1', session_key: 'session-key' };
        },
        decryptPhoneNumber: () => ({ purePhoneNumber: '+86 13800138000' }),
        validateUserSignature: () => true,
    };

    const { handler, restore } = loadWechatLoginHandler({ pocketbaseMock, jwtAuthMock, wechatMock });
    try {
        const payload = await postWechatLogin(
            createWechatLoginApp(handler),
            buildLoginBody({
                userInfo: { nickName: '看乐用户', avatarUrl: 'https://example.com/avatar.png' },
            })
        );

        assert.equal(payload.code, 10000);
        assert.equal(payload.data.id, 'student_1');
        assert.equal(payload.data.cellphone, '13800138000');
        assert.equal(payload.data.wechatId, 'openid_1');
        assert.equal(payload.data.token, 'jwt-token');
        assert.equal(createCalled, 1);
        assert.equal(updateCalled, 1);
        assert.ok(filters.some((filter) => filter.includes('wechatId="openid_1"')));
        assert.ok(filters.some((filter) => filter.includes('cellphone="13800138000"')));
    } finally {
        restore();
    }
});

test('wechat login does not persist an empty wechatUnionId on new student creation', async () => {
    let createPayload = null;

    const payload = await runWechatLoginWithMocks({
        body: buildLoginBody({
            code: 'wx-code-2',
            userInfo: { nickName: '看乐用户2' },
        }),
        mocks: createBaseMocks({
            session: { openid: 'openid_2', unionid: '', session_key: 'session-key' },
            decryptPhoneNumber: () => ({ purePhoneNumber: '13800138001' }),
            collectionApi: {
                async getList() {
                    return { items: [] };
                },
                async create(data) {
                    createPayload = data;
                    return { id: 'student_2', sn: data.sn, cellphone: data.cellphone, avatar: data.avatar };
                },
                async update() {
                    throw new Error('update should not be called for a fresh create');
                },
            },
        }),
    });

    assert.equal(payload.code, 10000);
    assert.ok(createPayload);
    assert.equal(createPayload.wechatId, 'openid_2');
    assert.equal('wechatUnionId' in createPayload, false);
    assert.equal(createPayload.idcard, null);
});

test('wechat login rejects requests without code or encrypted phone data', async () => {
    assert.deepEqual(await runWechatLoginWithMocks({ body: buildLoginBody({ code: '' }) }), {
        code: 400,
        message: '缺少微信登录凭证',
        data: null,
    });

    assert.deepEqual(
        await runWechatLoginWithMocks({
            body: buildLoginBody({ phone: { encryptedData: '', iv: 'iv-data' } }),
        }),
        {
            code: 400,
            message: '缺少微信手机号授权信息',
            data: null,
        }
    );
});

test('wechat login normalizes JSON string request bodies', async () => {
    const payload = await runWechatLoginWithMocks({
        body: JSON.stringify(buildLoginBody({ auth_code: 'string-code', code: undefined })),
    });

    assert.equal(payload.code, 10000);
    assert.equal(payload.data.wechatId, 'openid_1');

    assert.deepEqual(await runWechatLoginWithMocks({ body: 'not valid json' }), {
        code: 400,
        message: '缺少微信登录凭证',
        data: null,
    });
});

test('wechat login accepts decrypted phoneNumber payloads and creates a tokenized student', async () => {
    const payload = await runWechatLoginWithMocks({
        mocks: createBaseMocks({
            session: { unionid: null },
            decryptPhoneNumber: () => ({ phoneNumber: '13800138009' }),
            sign: (_request, id, _sn, type, isAdmin) => {
                assert.equal(id, 'student_1');
                assert.equal(type, 'student');
                assert.equal(isAdmin, false);
                return 'jwt-token-nested';
            },
        }),
    });

    assert.equal(payload.code, 10000);
    assert.equal(payload.data.cellphone, '13800138009');
    assert.equal(payload.data.token, 'jwt-token-nested');
});
