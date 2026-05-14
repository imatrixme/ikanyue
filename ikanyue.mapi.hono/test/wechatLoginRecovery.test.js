const test = require('node:test');
const assert = require('node:assert/strict');

const { createBaseMocks, runWechatLoginWithMocks } = require('./support/wechatLoginHelpers');

test('wechat login duplicate recovery handles missing and blocked duplicated records', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.response = { data: { cellphone: { code: 'validation_not_unique' } } };

    let duplicateLookupCount = 0;
    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList() {
                        duplicateLookupCount += 1;
                        return { items: [] };
                    },
                    async create() {
                        throw duplicateError;
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
    assert.ok(duplicateLookupCount >= 3);

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList(_page, _perPage, options = {}) {
                        if (options.filter?.includes('cellphone=')) {
                            return { items: [{ id: 'blocked_duplicate', cellphone: '13800138000', blocked: true }] };
                        }
                        return { items: [] };
                    },
                    async create() {
                        throw duplicateError;
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
});

test('wechat login recovers duplicate creates from 409 status errors', async () => {
    const duplicateError = new Error('conflict');
    duplicateError.status = 409;
    let createCalled = false;

    const payload = await runWechatLoginWithMocks({
        mocks: createBaseMocks({
            collectionApi: {
                async getList(_page, _perPage, options = {}) {
                    if (createCalled && options.filter?.includes('wechatId=')) {
                        return {
                            items: [
                                {
                                    id: 'duplicate_by_wechat',
                                    sn: 'sn_duplicate',
                                    cellphone: '13800138000',
                                    nickName: '已有用户',
                                    avatar: 'https://example.com/avatar.png',
                                    gender: 1,
                                    age: 9,
                                    blocked: false,
                                },
                            ],
                        };
                    }
                    return { items: [] };
                },
                async create() {
                    createCalled = true;
                    throw duplicateError;
                },
                async update(id, data) {
                    return {
                        id,
                        sn: 'sn_duplicate',
                        nickName: '已有用户',
                        avatar: 'https://example.com/avatar.png',
                        gender: 1,
                        age: 9,
                        ...data,
                    };
                },
            },
        }),
    });

    assert.equal(payload.code, 10000);
    assert.equal(payload.data.id, 'duplicate_by_wechat');
    assert.equal(payload.data.wechatId, 'openid_1');
});
