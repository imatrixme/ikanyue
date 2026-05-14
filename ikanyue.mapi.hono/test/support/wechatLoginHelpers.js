const Module = require('node:module');
const { Hono } = require('hono');
const assert = require('node:assert/strict');

const { responseMiddleware } = require('../../src/middleware/response');

const routeModulePath = require.resolve('../../src/routes/user/wechatLogin');
const pocketbaseModulePath = require.resolve('../../src/utils/pocketbase');
const jwtAuthModulePath = require.resolve('../../src/utils/jwtAuth');
const wechatModulePath = require.resolve('../../src/utils/wechat');

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
        headers: { 'content-type': 'application/json' },
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

module.exports = {
    buildLoginBody,
    createBaseMocks,
    createWechatLoginApp,
    loadWechatLoginHandler,
    postWechatLogin,
    runWechatLoginWithMocks,
};
