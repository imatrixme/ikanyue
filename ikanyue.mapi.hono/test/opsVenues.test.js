const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_VENUE, ensureDefaultVenue } = require('../scripts/lib/points-lite-bootstrap');
const { OPS_COLLECTION_SCHEMAS } = require('../src/services/ops/schema');
const { VenueService, validateVenuePayload } = require('../src/services/ops/venueService');
const {
    createOpsApp,
    createOpsSeed,
    createOpsTestRepository,
    createToken,
    jsonRequest,
} = require('./support/opsTestHarness');

function venueSeed() {
    return {
        ...createOpsSeed(),
        venues: [
            { id: 'venue_b', name: '看乐二店', status: 'active', sortOrder: 2, bookable: false, phone: '021-1234', address: '二店地址' },
            { id: 'venue_a', name: '看乐艺术', status: 'active', sortOrder: 1, bookable: true, phone: '18521301857', intro: '声乐课程与预约' },
            { id: 'venue_off', name: '已停用', status: 'inactive', sortOrder: 0, bookable: true },
        ],
    };
}

test('public venue list needs no sign-in and returns active venues in sort order with display fields only', async () => {
    const app = createOpsApp(createOpsTestRepository(venueSeed()));

    const response = await jsonRequest(app, '/v1/public/venues');

    assert.equal(response.code, 10000);
    assert.deepEqual(response.data.items.map((item) => item.id), ['venue_a', 'venue_b']);
    assert.deepEqual(response.data.items[0], {
        address: '',
        bookable: true,
        id: 'venue_a',
        intro: '声乐课程与预约',
        name: '看乐艺术',
        openingHours: '',
        phone: '18521301857',
    });
    assert.equal(response.data.items[1].bookable, false);
});

test('admin lists, creates, edits and deactivates venues with audit records', async () => {
    const seed = venueSeed();
    const repository = createOpsTestRepository(seed);
    const app = createOpsApp(repository);
    const adminToken = createToken(seed.teachers[1]);

    const list = await jsonRequest(app, '/ops/venues', { token: adminToken });
    assert.deepEqual(list.data.items.map((item) => [item.id, item.status]), [
        ['venue_off', 'inactive'], ['venue_a', 'active'], ['venue_b', 'active'],
    ]);

    const invalid = await jsonRequest(app, '/ops/venues', { method: 'POST', token: adminToken, body: { name: ' ' } });
    assert.equal(invalid.code, 400);
    assert.equal(invalid.message, '场馆名称不能为空');

    const created = await jsonRequest(app, '/ops/venues', {
        method: 'POST',
        token: adminToken,
        body: { name: '看乐三店', bookable: true, openingHours: '每天 10:00-21:00', sortOrder: 3 },
    });
    assert.equal(created.code, 10000);
    assert.equal(created.data.status, 'active');
    assert.equal(created.data.bookable, true);

    const updated = await jsonRequest(app, `/ops/venues/${created.data.id}`, {
        method: 'POST',
        token: adminToken,
        body: { status: 'inactive' },
    });
    assert.equal(updated.data.status, 'inactive');
    assert.equal(updated.data.openingHours, '每天 10:00-21:00');

    const publicList = await jsonRequest(app, '/v1/public/venues');
    assert.equal(publicList.data.items.some((item) => item.id === created.data.id), false);
    assert.deepEqual(
        repository.data.ops_audit_logs.filter((log) => log.resourceType === 'venues').map((log) => log.action),
        ['ops.venue.create', 'ops.venue.update'],
    );
});

test('venue management requires an ops admin', async () => {
    const seed = venueSeed();
    const app = createOpsApp(createOpsTestRepository(seed));

    const anonymous = await jsonRequest(app, '/ops/venues');
    assert.notEqual(anonymous.code, 10000);
    const teacher = await jsonRequest(app, '/ops/venues', {
        method: 'POST',
        token: createToken(seed.teachers[0]),
        body: { name: '越权场馆' },
    });
    assert.equal(teacher.code, 403);
});

test('venue payload validation trims fields and rejects oversize text and malformed phones', async () => {
    assert.deepEqual(validateVenuePayload({ name: ' 看乐 ', bookable: 'true', sortOrder: '2.7', status: 'bogus' }), {
        address: '', bookable: true, intro: '', name: '看乐', openingHours: '', phone: '', sortOrder: 2, status: 'active',
    });
    assert.throws(() => validateVenuePayload({ name: 'x'.repeat(41) }), /场馆名称不能超过 40 个字/);
    assert.throws(() => validateVenuePayload({ name: '看乐', phone: 'call me' }), /咨询电话/);
    await assert.rejects(
        new VenueService(createOpsTestRepository()).update({ id: 'admin', isAdmin: true }, ' ', {}),
        /场馆不能为空/,
    );
});

test('ops schema defines venues and the default venue is seeded only once', async () => {
    const venues = OPS_COLLECTION_SCHEMAS.find((schema) => schema.name === 'venues');
    assert.ok(venues);
    assert.equal(venues.fields.find((field) => field.name === 'bookable').type, 'bool');

    const created = [];
    let items = [];
    const pb = {
        collection(name) {
            assert.equal(name, 'venues');
            return {
                async getList() { return { items }; },
                async create(payload) { created.push(payload); items = [payload]; return payload; },
            };
        },
    };
    await ensureDefaultVenue(pb);
    await ensureDefaultVenue(pb);
    assert.deepEqual(created, [DEFAULT_VENUE]);
});
