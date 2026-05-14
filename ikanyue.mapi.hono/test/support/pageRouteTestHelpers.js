const Module = require('node:module');
const { Hono } = require('hono');

const { responseMiddleware } = require('../../src/middleware/response');

const pocketbaseModulePath = require.resolve('../../src/utils/pocketbase');
const jwtAuthModulePath = require.resolve('../../src/utils/jwtAuth');
const activityFindModulePath = require.resolve('../../src/routes/activity/find');
const audioMaterialFindModulePath = require.resolve('../../src/routes/audioMaterial/find');
const videoMaterialFindModulePath = require.resolve('../../src/routes/videoMaterial/find');
const userLoginModulePath = require.resolve('../../src/routes/user/login');
const userRefreshModulePath = require.resolve('../../src/routes/user/refresh');
const userUpdateModulePath = require.resolve('../../src/routes/user/update');

function setMockedModule(modulePath, exportsValue) {
    const mockedModule = new Module(modulePath);
    mockedModule.filename = modulePath;
    mockedModule.loaded = true;
    mockedModule.exports = exportsValue;
    require.cache[modulePath] = mockedModule;
}

function restoreModuleCacheEntries(originalEntries) {
    originalEntries.forEach((entry, modulePath) => {
        if (entry) {
            require.cache[modulePath] = entry;
        } else {
            delete require.cache[modulePath];
        }
    });
}

function withMockedRouteModules(modulePaths, { pocketbaseMock, jwtAuthMock } = {}, fn) {
    const mockPaths = [pocketbaseModulePath];
    if (jwtAuthMock) {
        mockPaths.push(jwtAuthModulePath);
    }
    const pathsToRestore = [...mockPaths, ...modulePaths];
    const originalEntries = new Map(pathsToRestore.map((modulePath) => [modulePath, require.cache[modulePath]]));

    modulePaths.forEach((modulePath) => {
        delete require.cache[modulePath];
    });
    if (pocketbaseMock) {
        setMockedModule(pocketbaseModulePath, pocketbaseMock);
    }
    if (jwtAuthMock) {
        setMockedModule(jwtAuthModulePath, jwtAuthMock);
    }

    const modules = modulePaths.map((modulePath) => require(modulePath));

    return Promise.resolve()
        .then(() => fn(...modules))
        .finally(() => restoreModuleCacheEntries(originalEntries));
}

function withMockedFindRouteModule(modulePath, exportName, pocketbaseMock, fn) {
    return withMockedRouteModules([modulePath], { pocketbaseMock }, (moduleExports) => fn(moduleExports[exportName]));
}

function withMockedUserRouteModules({ pocketbaseMock, jwtAuthMock }, fn) {
    return withMockedRouteModules(
        [userLoginModulePath, userRefreshModulePath, userUpdateModulePath],
        { pocketbaseMock, jwtAuthMock },
        (loginModule, refreshModule, updateModule) =>
            fn({
                userLoginHandler: loginModule.userLoginHandler,
                userRefreshHandler: refreshModule.userRefreshHandler,
                userUpdateHandler: updateModule.userUpdateHandler,
            })
    );
}

function createRouteApp(routePath, method, handler) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    app[method](routePath, handler);
    return app;
}

function createCollectionMock(collections) {
    return {
        collection(name) {
            const collection = collections[name];
            if (!collection) {
                throw new Error(`Unexpected collection ${name}`);
            }
            return collection;
        },
    };
}

async function requestJson(app, path, options) {
    const response = await app.request(path, options);
    return response.json();
}

async function withEnv(env, fn) {
    const previousEnv = {};
    Object.keys(env).forEach((key) => {
        previousEnv[key] = process.env[key];
        if (env[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = env[key];
        }
    });

    try {
        return await fn();
    } finally {
        Object.entries(previousEnv).forEach(([key, value]) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
}

module.exports = {
    activityFindModulePath,
    audioMaterialFindModulePath,
    createCollectionMock,
    createRouteApp,
    requestJson,
    videoMaterialFindModulePath,
    withEnv,
    withMockedFindRouteModule,
    withMockedUserRouteModules,
};
