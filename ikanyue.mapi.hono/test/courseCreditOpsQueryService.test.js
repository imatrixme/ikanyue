const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditOpsQueryService,
    RESOURCE_CONFIGS,
    arrayPage,
    configFor,
    emptyAccount,
    groupAccounts,
    project,
    projectAccountBatch,
    relationOrValue,
} = require('../src/services/courseCredits/opsQueryService');

test('ops resource queries use allowlisted fields, status filters, and pagination', async () => {
    const repository = mockRepository({
        records: [{
            id: 'order', orderNo: 'O-1', studentId: { id: 'student' }, status: 'paid',
            currency: 'CNY', paidAmount: 2800, grantSnapshot: { private: true },
        }],
    });
    const service = new CourseCreditOpsQueryService(repository);
    const result = await service.listResource('orders', { page: '2', perPage: '10', status: 'paid' });

    assert.equal(result.page, 2);
    assert.equal(result.items[0].studentId, 'student');
    assert.equal(result.items[0].paidAmount, 2800);
    assert.equal(result.items[0].grantSnapshot, undefined);
    assert.equal(repository.calls[0].options.filter, 'status="paid"');
    assert.equal(repository.calls[0].options.sort, '-created');
});

test('every Admin workspace resource supports list and detail projections', async () => {
    const repository = mockRepository({ records: [{ id: 'record', status: 'active' }] });
    const service = new CourseCreditOpsQueryService(repository);

    for (const name of Object.keys(RESOURCE_CONFIGS)) {
        const listed = await service.listResource(name);
        assert.equal(listed.items[0].id, 'record', name);
        repository.first = { id: 'record', status: 'active' };
        assert.equal((await service.getResource(name, 'record')).id, 'record', name);
    }
    assert.equal(repository.calls.length, Object.keys(RESOURCE_CONFIGS).length * 2);
});

test('ops resource validation rejects unsupported resources, filters, and missing records', async () => {
    const repository = mockRepository({ records: [] });
    const service = new CourseCreditOpsQueryService(repository);

    await assert.rejects(service.listResource('unknown'), hasCode('OPS_RESOURCE_INVALID'));
    await assert.rejects(service.listResource('orders', { status: 'unknown' }), hasCode('OPS_FILTER_STATUS_INVALID'));
    await assert.rejects(service.getResource('orders', ''), hasCode('OPS_RESOURCE_ID_REQUIRED'));
    repository.first = null;
    await assert.rejects(service.getResource('orders', 'missing'), hasCode('OPS_RESOURCE_NOT_FOUND'));
    assert.throws(() => configFor('unknown'), hasCode('OPS_RESOURCE_INVALID'));
});

test('credit account list groups batch buckets and paginates by student', async () => {
    const repository = mockRepository({
        batches: [
            batch({ studentId: 'student-b', status: 'unactivated', availableQuantity: 2 }),
            batch({ studentId: 'student-a', availableQuantity: 3, frozenQuantity: 1 }),
            batch({ studentId: { id: 'student-a' }, consumedQuantity: 4, expiredQuantity: 1 }),
        ],
    });
    const service = new CourseCreditOpsQueryService(repository);
    const firstPage = await service.listAccounts({ page: 1, perPage: 1 });
    const secondPage = await service.listAccounts({ page: 2, perPage: 1 });

    assert.equal(firstPage.totalItems, 2);
    assert.equal(firstPage.totalPages, 2);
    assert.equal(firstPage.items[0].studentId, 'student-a');
    assert.equal(firstPage.items[0].batchCount, 2);
    assert.equal(firstPage.items[0].availableQuantity, 3);
    assert.equal(firstPage.items[0].frozenQuantity, 1);
    assert.equal(firstPage.items[0].consumedQuantity, 4);
    assert.equal(secondPage.items[0].unactivatedQuantity, 2);
});

test('credit account detail exposes auditable cost fields without raw snapshots', async () => {
    const repository = mockRepository({
        batches: [batch({
            studentId: 'student', creditTypeId: ['course'], sourceOperationId: { id: 'operation' },
            effectiveExpiresAt: '2026-12-31T00:00:00Z', listUnitValue: '300', paidUnitCost: '280',
            currency: 'CNY', grantSnapshot: { private: true },
        })],
    });
    const account = await new CourseCreditOpsQueryService(repository).getAccount('student');

    assert.equal(account.studentId, 'student');
    assert.equal(account.batches[0].creditTypeId, 'course');
    assert.equal(account.batches[0].sourceOperationId, 'operation');
    assert.equal(account.batches[0].paidUnitCost, 280);
    assert.equal(account.batches[0].grantSnapshot, undefined);
    assert.match(repository.calls[0].options.filter, /studentId="student"/);
});

test('ops projection helpers normalize relations, empty accounts, and empty pages', () => {
    assert.equal(RESOURCE_CONFIGS.reconciliationRuns.statuses.has('pending'), true);
    assert.deepEqual(project({ id: 'one', tags: ['a', { id: 'b' }] }, ['id', 'tags', 'missing']), {
        id: 'one', tags: ['a', 'b'], missing: null,
    });
    assert.equal(relationOrValue({ id: 'record' }), 'record');
    assert.equal(relationOrValue(null), null);
    assert.deepEqual(emptyAccount('student'), {
        studentId: 'student', batchCount: 0, availableQuantity: 0, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, unactivatedQuantity: 0,
    });
    assert.deepEqual(arrayPage([], 1, 20), {
        page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [],
    });
    assert.equal(groupAccounts([]).size, 0);
    const projected = projectAccountBatch({});
    assert.equal(projected.effectiveExpiresAt, null);
    assert.equal(projected.listUnitValue, 0);
});

function mockRepository(options = {}) {
    return {
        calls: [],
        first: options.records?.[0] || null,
        async page(collection, page, perPage, requestOptions) {
            this.calls.push({ method: 'page', collection, page, perPage, options: requestOptions });
            const items = options.records || [];
            return { page, perPage, totalItems: items.length, totalPages: items.length ? 1 : 0, items };
        },
        async findFirst(collection, filter, requestOptions) {
            this.calls.push({ method: 'findFirst', collection, filter, options: requestOptions });
            return this.first;
        },
        async list(collection, requestOptions) {
            this.calls.push({ method: 'list', collection, options: requestOptions });
            return options.batches || [];
        },
    };
}

function batch(changes = {}) {
    return {
        id: 'batch', studentId: 'student', creditTypeId: 'course', sourceOperationId: 'operation',
        status: 'active', originalQuantity: 10, availableQuantity: 0, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, listUnitValue: 0, paidUnitCost: 0,
        ...changes,
    };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
