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

function createWechatLoginApp(handler) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app.post('/v1/user/wechat-login', handler);
    return app;
}

function buildLoginBody(overrides = {}) {
    return {
        code: 'wx-code',
        userInfo: {
            nickName: '看乐用户',
            avatarUrl: 'https://example.com/avatar.png',
            gender: 1,
        },
        phone: {
            encryptedData: 'encrypted-data',
            iv: 'iv-data',
        },
        signature: 'signature',
        rawData: '{"nickName":"看乐用户"}',
        ...overrides,
    };
}

async function postWechatLogin(app, body) {
    const response = await app.request('http://localhost/v1/user/wechat-login', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    return response.json();
}

function createBaseMocks(overrides = {}) {
    const student = {
        id: 'student_1',
        sn: 'sn_1',
        cellphone: '13800138000',
        nickName: '旧昵称',
        avatar: '',
        blocked: false,
    };

    const collectionApi = {
        async getList() {
            return { items: [] };
        },
        async create(data) {
            return {
                ...student,
                ...data,
            };
        },
        async update(id, data) {
            return {
                ...student,
                ...data,
                id,
            };
        },
        ...(overrides.collectionApi || {}),
    };

    return {
        pocketbaseMock: {
            collection(name) {
                assert.equal(name, 'students');
                return collectionApi;
            },
        },
        jwtAuthMock: {
            jwtAuth: {
                sign: overrides.sign || (() => 'jwt-token'),
            },
        },
        wechatMock: {
            async exchangeCodeForSession() {
                return {
                    openid: 'openid_1',
                    unionid: 'unionid_1',
                    session_key: 'session-key',
                    ...(overrides.session || {}),
                };
            },
            decryptPhoneNumber: overrides.decryptPhoneNumber || (() => ({ purePhoneNumber: '+86 13800138000' })),
            validateUserSignature: overrides.validateUserSignature || (() => true),
        },
    };
}

async function runWechatLoginWithMocks({ body = buildLoginBody(), mocks = createBaseMocks() } = {}) {
    const { handler, restore } = loadWechatLoginHandler(mocks);

    try {
        const app = createWechatLoginApp(handler);
        return await postWechatLogin(app, body);
    } finally {
        restore();
    }
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

test('wechat login does not persist an empty wechatUnionId on new student creation', async () => {
    let createPayload = null;

    const pocketbaseMock = {
        collection(name) {
            assert.equal(name, 'students');

            return {
                async getList() {
                    return { items: [] };
                },
                async create(data) {
                    createPayload = data;

                    return {
                        id: 'student_2',
                        sn: data.sn,
                        cellphone: data.cellphone,
                        avatar: data.avatar,
                    };
                },
                async update() {
                    throw new Error('update should not be called for a fresh create');
                },
            };
        },
    };

    const jwtAuthMock = {
        jwtAuth: {
            sign() {
                return 'jwt-token-2';
            },
        },
    };

    const wechatMock = {
        async exchangeCodeForSession() {
            return {
                openid: 'openid_2',
                unionid: '',
                session_key: 'session-key',
            };
        },
        decryptPhoneNumber() {
            return {
                purePhoneNumber: '13800138001',
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
                code: 'wx-code-2',
                userInfo: {
                    nickName: '看乐用户2',
                },
                phone: {
                    encryptedData: 'encrypted-data',
                    iv: 'iv-data',
                },
            }),
        });

        const payload = await response.json();

        assert.equal(payload.code, 10000);
        assert.ok(createPayload);
        assert.equal(createPayload.wechatId, 'openid_2');
        assert.equal('wechatUnionId' in createPayload, false);
        assert.equal(createPayload.idcard, null);
    } finally {
        restore();
    }
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

test('wechat login handles session exchange and malformed session failures', async () => {
    const exchangeFailureMocks = createBaseMocks({
        session: {
            get openid() {
                throw new Error('exchange failed');
            },
        },
    });
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
                        return {
                            items: [
                                {
                                    id: 'blocked_1',
                                    cellphone: '13800138000',
                                    blocked: true,
                                },
                            ],
                        };
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
                        return {
                            items: [
                                {
                                    id: 'student_existing',
                                    cellphone: '13800138000',
                                    blocked: false,
                                },
                            ],
                        };
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

test('wechat login duplicate recovery handles missing and blocked duplicated records', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.response = {
        data: {
            cellphone: {
                code: 'validation_not_unique',
            },
        },
    };

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
                            return {
                                items: [
                                    {
                                        id: 'blocked_duplicate',
                                        cellphone: '13800138000',
                                        blocked: true,
                                    },
                                ],
                            };
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

test('wechat login duplicate recovery reports update failures after finding existing student', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.data = {
        data: {
            wechatId: {
                code: 'validation_not_unique',
            },
        },
    };
    let createCalled = false;

    assert.deepEqual(
        await runWechatLoginWithMocks({
            mocks: createBaseMocks({
                collectionApi: {
                    async getList(_page, _perPage, options = {}) {
                        if (createCalled && options.filter?.includes('cellphone=')) {
                            return {
                                items: [
                                    {
                                        id: 'duplicate_student',
                                        cellphone: '13800138000',
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

test('wechat login accepts decrypted phoneNumber payloads and creates a tokenized student', async () => {
    const payload = await runWechatLoginWithMocks({
        mocks: createBaseMocks({
            session: {
                unionid: null,
            },
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

test('wechat login accepts query auth code and parsed form body payloads', async () => {
    let updatePayload = null;
    const { handler, restore } = loadWechatLoginHandler(
        createBaseMocks({
            session: {
                unionid: '',
            },
            collectionApi: {
                async getList(_page, _perPage, options = {}) {
                    if (options.filter?.includes('cellphone=')) {
                        return {
                            items: [
                                {
                                    id: 'student_form',
                                    sn: 'sn_form',
                                    cellphone: '13800138088',
                                    nickName: '',
                                    avatar: '',
                                    gender: '',
                                    age: '',
                                    blocked: false,
                                },
                            ],
                        };
                    }
                    return { items: [] };
                },
                async update(id, data) {
                    updatePayload = data;
                    return {
                        id,
                        sn: 'sn_form',
                        cellphone: data.cellphone,
                        avatar: data.avatar,
                        nickName: data.nickName,
                        gender: data.gender,
                        age: data.age,
                    };
                },
            },
        })
    );

    try {
        const app = createWechatLoginApp(handler);
        const body = new URLSearchParams();
        body.set(
            'phone',
            JSON.stringify({
                encryptedData: 'encrypted-data',
                iv: 'iv-data',
            })
        );
        body.set(
            'userInfo',
            JSON.stringify({
                nickname: '表单用户',
                avatar: 'https://example.com/form-avatar.png',
                gender: '2',
                age: '11',
            })
        );
        body.set('rawData', '{"nickname":"表单用户"}');
        body.set('signature', 'signature');

        const response = await app.request('http://localhost/v1/user/wechat-login?authCode=query-code', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-real-ip': '127.0.0.1',
            },
            body,
        });
        const payload = await response.json();

        assert.equal(payload.code, 10000);
        assert.equal(payload.data.nickName, '表单用户');
        assert.equal(updatePayload.age, 11);
        assert.equal(updatePayload.gender, '2');
        assert.equal(updatePayload.lastLoginIp, '127.0.0.1');
    } finally {
        restore();
    }
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

test('wechat login accepts FormData parsed bodies', async () => {
    let updatedLoginIp = null;
    const { handler, restore } = loadWechatLoginHandler(
        createBaseMocks({
            collectionApi: {
                async getList(_page, _perPage, options = {}) {
                    if (options.filter?.includes('cellphone=')) {
                        return {
                            items: [
                                {
                                    id: 'student_formdata',
                                    sn: 'sn_formdata',
                                    cellphone: '13800138077',
                                    nickName: '',
                                    avatar: '',
                                    gender: '',
                                    age: '',
                                    blocked: false,
                                },
                            ],
                        };
                    }
                    return { items: [] };
                },
                async update(id, data) {
                    updatedLoginIp = data.lastLoginIp;
                    return {
                        id,
                        sn: 'sn_formdata',
                        cellphone: data.cellphone,
                        avatar: data.avatar,
                        nickName: data.nickName,
                    };
                },
            },
        })
    );

    try {
        const body = new FormData();
        body.set('auth_code', 'formdata-code');
        body.set(
            'phone',
            JSON.stringify({
                encryptedData: 'encrypted-data',
                iv: 'iv-data',
            })
        );
        body.set(
            'userInfo',
            JSON.stringify({
                nickName: 'FormData 用户',
            })
        );
        body.set('rawData', '{}');
        body.set('signature', 'signature');

        const result = await handler({
            req: {
                header(name) {
                    return {
                        'content-type': 'multipart/form-data',
                        'x-forwarded-for': '10.0.0.1',
                    }[name.toLowerCase()];
                },
                query() {
                    return {};
                },
                async parseBody() {
                    return body;
                },
            },
            error(code, message) {
                return { code, message, data: null };
            },
            data(data) {
                return { code: 10000, message: null, data };
            },
        });

        assert.equal(result.code, 10000);
        assert.equal(result.data.nickName, 'FormData 用户');
        assert.equal(updatedLoginIp, '10.0.0.1');
    } finally {
        restore();
    }
});
