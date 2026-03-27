const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');

const routeModulePath = require.resolve('../src/routes/user/wechatLogin');
const pocketbaseModulePath = require.resolve('../src/utils/pocketbase');
const jwtAuthModulePath = require.resolve('../src/utils/jwtAuth');
const wechatModulePath = require.resolve('../src/utils/wechat');

function setMockedModule(modulePath, exportsValue) {
    const mockedModule = new Module(modulePath);
    mockedModule.filename = modulePath;
    mockedModule.loaded = true;
    mockedModule.exports = exportsValue;
    require.cache[modulePath] = mockedModule;
}

function loadWechatLoginHandler({ pocketbaseMock, jwtAuthMock, wechatMock }) {
    const originalEntries = new Map([
        [routeModulePath, require.cache[routeModulePath]],
        [pocketbaseModulePath, require.cache[pocketbaseModulePath]],
        [jwtAuthModulePath, require.cache[jwtAuthModulePath]],
        [wechatModulePath, require.cache[wechatModulePath]],
    ]);

    delete require.cache[routeModulePath];
    setMockedModule(pocketbaseModulePath, pocketbaseMock);
    setMockedModule(jwtAuthModulePath, jwtAuthMock);
    setMockedModule(wechatModulePath, wechatMock);

    const loaded = require(routeModulePath);

    return {
        handler: loaded.userWechatLoginHandler,
        restore() {
            originalEntries.forEach((entry, modulePath) => {
                if (entry) {
                    require.cache[modulePath] = entry;
                } else {
                    delete require.cache[modulePath];
                }
            });
        },
    };
}

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

                    if (filters.length <= 2) {
                        return { items: [] };
                    }

                    return { items: [baseStudent] };
                },
                async create() {
                    createCalled += 1;

                    const duplicateError = new Error('value must be unique');
                    duplicateError.response = {
                        data: {
                            cellphone: {
                                code: 'validation_not_unique',
                            },
                        },
                    };
                    throw duplicateError;
                },
                async update(id, data) {
                    updateCalled += 1;
                    return {
                        ...baseStudent,
                        ...data,
                        id,
                    };
                },
            };
        },
    };

    const jwtAuthMock = {
        jwtAuth: {
            sign() {
                return 'jwt-token';
            },
        },
    };

    const wechatMock = {
        async exchangeCodeForSession() {
            return {
                openid: 'openid_1',
                unionid: 'unionid_1',
                session_key: 'session-key',
            };
        },
        decryptPhoneNumber() {
            return {
                purePhoneNumber: '+86 13800138000',
            };
        },
        validateUserSignature() {
            return true;
        },
    };

    const { handler, restore } = loadWechatLoginHandler({
        pocketbaseMock,
        jwtAuthMock,
        wechatMock,
    });

    try {
        const app = new Hono();
        app.use('*', responseMiddleware());
        app.post('/v1/user/wechat-login', handler);

        const response = await app.request('http://localhost/v1/user/wechat-login', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                code: 'wx-code',
                userInfo: {
                    nickName: '看乐用户',
                    avatarUrl: 'https://example.com/avatar.png',
                },
                phone: {
                    encryptedData: 'encrypted-data',
                    iv: 'iv-data',
                },
            }),
        });

        const payload = await response.json();

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
