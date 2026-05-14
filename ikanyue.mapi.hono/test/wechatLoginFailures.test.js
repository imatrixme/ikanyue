const test = require('node:test');
const assert = require('node:assert/strict');

const { createBaseMocks, runWechatLoginWithMocks } = require('./support/wechatLoginHelpers');

test('wechat login handles session exchange and malformed session failures', async () => {
    const exchangeFailureMocks = createBaseMocks();
    exchangeFailureMocks.wechatMock.exchangeCodeForSession = async () => {
        throw new Error('exchange failed');
    };

    assert.deepEqual(await runWechatLoginWithMocks({ mocks: exchangeFailureMocks }), {
        code: 500,
        message: 'exchange failed',
        data: null,
    });

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                session: {
                    openid: '',
                    session_key: '',
                },
            }),
        }),
        {
            code: 500,
            message: '微信返回数据异常，请稍后重试',
            data: null,
        }
    );
});

test('wechat login validates signature and decrypts phone numbers', async () => {
    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                validateUserSignature: () => false,
            }),
        }),
        {
            code: 403,
            message: '微信用户信息校验失败，请重新授权',
            data: null,
        }
    );

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                decryptPhoneNumber() {
                    throw new Error('decrypt failed');
                },
            }),
        }),
        {
            code: 400,
            message: '微信手机号解析失败，请重新授权',
            data: null,
        }
    );

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                decryptPhoneNumber: () => ({ purePhoneNumber: '' }),
            }),
        }),
        {
            code: 400,
            message: '未获取到有效的手机号',
            data: null,
        }
    );
});

test('wechat login rejects blocked existing students and reports lookup failures', async () => {
    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList() {
                        return { items: [{ id: 'blocked_1', cellphone: '13800138000', blocked: true }] };
                    },
                },
            }),
        }),
        {
            code: 403,
            message: '该账号已被封禁，请联系客服',
            data: null,
        }
    );

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList() {
                        throw new Error('query failed');
                    },
                },
            }),
        }),
        {
            code: 500,
            message: '查询用户信息失败，请稍后再试',
            data: null,
        }
    );
});

test('wechat login reports update and create failures', async () => {
    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList() {
                        return { items: [{ id: 'student_existing', cellphone: '13800138000', blocked: false }] };
                    },
                    async update() {
                        throw new Error('update failed');
                    },
                },
            }),
        }),
        {
            code: 500,
            message: '更新用户信息失败，请稍后重试',
            data: null,
        }
    );

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList() {
                        return { items: [] };
                    },
                    async create() {
                        throw new Error('database unavailable');
                    },
                },
            }),
        }),
        {
            code: 500,
            message: '创建用户失败，请稍后重试',
            data: null,
        }
    );
});

test('wechat login duplicate recovery reports update failures after finding existing student', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.data = { data: { wechatId: { code: 'validation_not_unique' } } };
    let createCalled = false;

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList(_page, _perPage, options = {}) {
                        if (createCalled && options.filter?.includes('cellphone=')) {
                            return { items: [{ id: 'duplicate_student', cellphone: '13800138000', blocked: false }] };
                        }
                        return { items: [] };
                    },
                    async create() {
                        createCalled = true;
                        throw duplicateError;
                    },
                    async update() {
                        throw new Error('recovery update failed');
                    },
                },
            }),
        }),
        {
            code: 500,
            message: '创建用户失败，请稍后重试',
            data: null,
        }
    );
});
