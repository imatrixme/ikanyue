const test = require('node:test');
const assert = require('node:assert/strict');
const { Hono } = require('hono');

const { responseMiddleware } = require('../src/middleware/response');
const publicCourseCatalogRoutes = require('../src/routes/publicCourseCatalog');
const { createPublicCourseCatalogHandlers } = require('../src/routes/publicCourseCatalog');
const {
    PublicCourseCatalogService,
    currentPrice,
    packagesForCourses,
    projectCourse,
    projectGrant,
    projectPackage,
} = require('../src/services/courseCredits/publicCatalogService');
const { createRouteBuilder } = require('../src/utils/routeBuilder');

const NOW = '2026-08-17T12:00:00.000Z';

test('public catalog projects only active courses, current prices, validity, and grant summaries', async () => {
    const service = new PublicCourseCatalogService(repository(), { clock: () => Date.parse(NOW) });
    const catalog = await service.catalog();

    assert.equal(catalog.courses.length, 1);
    assert.equal(catalog.packages.length, 1);
    assert.deepEqual(catalog.courses[0], {
        code: 'VOCAL-60', deliveryMode: 'one_to_one', durationMinutes: 60,
        name: '成人声乐一对一', packageCodes: ['VOCAL-10'], teacherTier: 'senior',
    });
    assert.deepEqual(catalog.packages[0], {
        code: 'VOCAL-10', description: '十节系统训练',
        grants: [{
            courseCode: 'VOCAL-60', courseName: '成人声乐一对一', creditName: '成人声乐课点',
            quantity: 10, unitLabel: '课时',
        }],
        name: '成人声乐十节课包',
        price: { currency: 'CNY', listAmount: 3000, saleAmount: 2800 },
        purchaseMode: 'contact',
        validity: {
            activationDeadlineDays: 30, activationMode: 'FIRST_CHECK_IN',
            expiryPolicy: 'FIXED_DURATION', validityDurationDays: 180,
        },
    });
    const serialized = JSON.stringify(catalog);
    for (const privateField of [
        'studentId', 'balance', 'roster', 'orderNo', 'payerId', 'teacherId',
        'teacherCredit', 'grantSnapshot', 'metadata', 'idempotencyKey',
    ]) assert.equal(serialized.includes(privateField), false, privateField);
});

test('course and package details reject unpublished or unknown records', async () => {
    const service = new PublicCourseCatalogService(repository(), { clock: () => Date.parse(NOW) });
    assert.equal((await service.course('VOCAL-60')).packages[0].code, 'VOCAL-10');
    assert.equal((await service.package('VOCAL-10')).name, '成人声乐十节课包');
    await assert.rejects(service.course('DRAFT-COURSE'), hasCode('PUBLIC_COURSE_NOT_FOUND'));
    await assert.rejects(service.package('EXPIRED-PACKAGE'), hasCode('PUBLIC_PACKAGE_NOT_FOUND'));
});

test('public routes require no bearer token and preserve safe not-found errors', async () => {
    const services = { repository: repository() };
    const app = createApp(async () => services);
    const catalog = await get(app, '/v1/public/course-catalog');
    const detail = await get(app, '/v1/public/course-catalog/packages/VOCAL-10');
    const missing = await get(app, '/v1/public/course-catalog/packages/missing');

    assert.equal(catalog.code, 10000);
    assert.equal(detail.data.code, 'VOCAL-10');
    assert.equal(missing.code, 404);
    assert.equal(missing.errorCode, 'PUBLIC_PACKAGE_NOT_FOUND');
});

test('public route normalizes unexpected storage failures without leaking details', async () => {
    const app = createApp(async () => { throw new Error('private database detail'); });
    const payload = await get(app, '/v1/public/course-catalog');
    assert.equal(payload.code, 500);
    assert.equal(payload.errorCode, 'PUBLIC_CATALOG_UNAVAILABLE');
    assert.equal(JSON.stringify(payload).includes('private database detail'), false);
});

test('catalog helpers select valid latest prices and build unique package links', () => {
    assert.equal(currentPrice([
        price({ id: 'expired', validTo: '2026-08-16T00:00:00Z', version: 9 }),
        price({ id: 'current-v1', version: 1 }),
        price({ id: 'current-v2', version: 2 }),
        price({ id: 'future', validFrom: '2026-08-18T00:00:00Z', version: 3 }),
        price({ id: 'invalid', validFrom: 'invalid', version: 4 }),
    ], Date.parse(NOW)).id, 'current-v2');
    assert.equal(currentPrice([], Date.parse(NOW)), null);
    assert.deepEqual(packagesForCourses([{ code: 'P1', grants: [
        { courseCode: 'C1' }, { courseCode: 'C1' }, { courseCode: null },
    ] }]).get('C1'), ['P1']);
});

test('public projections keep sparse legacy catalog records safe and explicit', async () => {
    assert.deepEqual(projectCourse({}, []), {
        code: '', deliveryMode: '', durationMinutes: 0, name: '', packageCodes: [], teacherTier: '',
    });
    const relations = {
        coursesById: new Map(),
        creditsById: new Map([
            ['credit', { id: 'credit', courseSpecId: 'missing' }],
        ]),
        grantLines: [
            { packageId: 'package', creditTypeId: 'missing' },
            { packageId: 'package', creditTypeId: 'credit' },
        ],
        priceVersions: [price({ packageId: 'package', currency: '', listAmount: 0, saleAmount: 0 })],
        now: Date.parse(NOW),
    };
    assert.equal(projectGrant({ creditTypeId: 'missing' }, relations), null);
    assert.deepEqual(projectGrant({ creditTypeId: 'credit' }, relations), {
        courseCode: null, courseName: null, creditName: '', quantity: 0, unitLabel: '课点',
    });
    const sparsePackage = projectPackage({ id: 'package', saleChannel: 'wechat' }, relations);
    assert.deepEqual(sparsePackage, {
        code: '', description: '', grants: [{
            courseCode: null, courseName: null, creditName: '', quantity: 0, unitLabel: '课点',
        }], name: '', price: { currency: '', listAmount: 0, saleAmount: 0 }, purchaseMode: 'mini_program',
        validity: { activationDeadlineDays: null, activationMode: '', expiryPolicy: '', validityDurationDays: null },
    });
    assert.equal(projectPackage({ id: 'no-price' }, relations), null);

    const catalog = await new PublicCourseCatalogService({ async list(collection) {
        if (collection === 'course_specs') return [{ id: 'orphan', code: 'ORPHAN', status: 'active' }];
        return [];
    } }).catalog();
    assert.deepEqual(catalog.courses[0].packageCodes, []);
    assert.equal(currentPrice([
        price({ id: 'no-version-a', version: undefined }),
        price({ id: 'no-version-b', version: undefined }),
    ], Date.parse(NOW)).id, 'no-version-a');
});

function createApp(loadServices) {
    const app = new Hono();
    app.use('*', responseMiddleware());
    const routes = createRouteBuilder(app);
    publicCourseCatalogRoutes(routes, createPublicCourseCatalogHandlers(loadServices));
    routes.finalize();
    return app;
}

async function get(app, path) {
    return (await app.request(path)).json();
}

function repository() {
    const records = {
        course_specs: [
            { id: 'course', code: 'VOCAL-60', name: '成人声乐一对一', deliveryMode: 'one_to_one',
                durationMinutes: 60, teacherTier: 'senior', status: 'active', metadata: { internal: true } },
            { id: 'draft-course', code: 'DRAFT-COURSE', name: '草稿', status: 'draft' },
        ],
        packages: [
            { id: 'package', code: 'VOCAL-10', name: '成人声乐十节课包', description: '十节系统训练',
                saleChannel: 'admin', activationMode: 'FIRST_CHECK_IN', activationDeadlineDays: 30,
                validityDurationDays: 180, expiryPolicy: 'FIXED_DURATION', status: 'active' },
            { id: 'expired-package', code: 'EXPIRED-PACKAGE', name: '已过期', saleChannel: 'website',
                activationMode: 'GRANT_TIME', expiryPolicy: 'NO_EXPIRY', status: 'active' },
        ],
        credit_types: [
            { id: 'credit', name: '成人声乐课点', courseSpecId: 'course', unitLabel: '课时', status: 'active' },
        ],
        package_grant_lines: [{ packageId: 'package', creditTypeId: 'credit', quantity: 10 }],
        price_versions: [
            price({ packageId: 'package', status: 'inactive', version: 9 }),
            price({ packageId: 'package' }),
            price({ packageId: 'expired-package', validTo: '2026-08-16T00:00:00Z' }),
        ],
    };
    return { async list(collection) { return records[collection] || []; } };
}

function price(changes = {}) {
    return {
        id: 'price', packageId: 'package', currency: 'CNY', listAmount: 3000, saleAmount: 2800,
        validFrom: '2026-08-01T00:00:00Z', validTo: '', version: 1, status: 'active',
        grantSnapshot: { private: true }, ...changes,
    };
}

function hasCode(code) {
    return (error) => error.code === code;
}
