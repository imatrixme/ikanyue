const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditQueryService,
    buildSummary,
    escapeFilter,
    mapBatch,
    mapConversionRule,
    mapCreditType,
    mapEvent,
    mapPage,
    mapSessionStudent,
    pagination,
    positiveInteger,
    quantity,
    relation,
    relationId,
    summaryOrder,
} = require('../src/services/courseCredits/queryService');

const NOW = Date.parse('2026-07-17T10:00:00.000Z');

test('student summary groups universal and exact-course batches with expiry warnings', async () => {
    const repository = mockRepository({
        batches: [
            batch({
                id: 'universal-batch', creditTypeId: 'universal', availableQuantity: 100,
                frozenQuantity: 0,
                effectiveExpiresAt: '2026-07-27T10:00:00.000Z',
                creditType: creditType('universal', 'universal', '通用课程点'),
            }),
            batch({
                id: 'course-unactivated', creditTypeId: 'course', status: 'unactivated',
                availableQuantity: 2, frozenQuantity: 1,
                effectiveExpiresAt: '2026-08-01T10:00:00.000Z',
                creditType: creditType('course', 'course', '声乐一对一', courseSpec()),
            }),
            batch({
                id: 'course-active', creditTypeId: 'course', availableQuantity: 3,
                frozenQuantity: 0,
                effectiveExpiresAt: '', creditType: creditType('course', 'course', '声乐一对一', courseSpec()),
            }),
        ],
    });
    const result = await new CourseCreditQueryService(repository, {
        clock: () => NOW, expiryWarningDays: 30,
    }).summary('student');

    assert.equal(result.warningDays, 30);
    assert.equal(result.items[0].creditType.id, 'universal');
    assert.equal(result.items[0].exchangeOnly, true);
    assert.equal(result.items[0].availableQuantity, 100);
    assert.equal(result.items[0].expiringQuantity, 100);
    assert.equal(result.items[1].availableQuantity, 3);
    assert.equal(result.items[1].unactivatedQuantity, 2);
    assert.equal(result.items[1].frozenQuantity, 1);
    assert.equal(result.items[1].expiringQuantity, 3);
    assert.equal(result.items[1].creditType.courseSpec.code, 'VOCAL-1V1');
    assert.match(repository.calls[0].options.filter, /studentId="student"/);
});

test('batch queries enforce ownership, pagination, filters, and safe projections', async () => {
    const repository = mockRepository({ batches: [batch()] });
    const service = new CourseCreditQueryService(repository, { clock: () => NOW });
    const result = await service.listBatches('student', {
        page: '2', perPage: '5', status: 'active', creditTypeId: 'course',
    });

    assert.equal(result.page, 2);
    assert.equal(result.perPage, 5);
    assert.equal(result.items[0].id, 'batch');
    assert.equal(result.items[0].creditType.name, '声乐一对一');
    assert.equal(result.items[0].sourceOperationId, 'operation');
    assert.equal(result.items[0].compensationSourceBatchId, null);
    assert.equal(result.items[0].grantSnapshot, undefined);
    assert.match(repository.calls[0].options.filter, /status="active"/);

    assert.equal((await service.getBatch('student', 'batch')).id, 'batch');
    repository.first = null;
    await assert.rejects(service.getBatch('student', 'missing'), hasCode('CREDIT_BATCH_NOT_FOUND'));
});

test('event, conversion-rule, and session queries expose only student-facing fields', async () => {
    const repository = mockRepository({
        events: [{
            id: 'event', operationId: 'operation', batchId: 'batch', creditTypeId: 'course',
            eventType: 'CONSUME', quantityDelta: -1, bucketFrom: 'frozenQuantity',
            bucketTo: 'consumedQuantity', businessTime: '2026-07-17T10:00:00Z',
            reason: 'lesson', metadata: { private: true },
            expand: {
                creditTypeId: creditType('course', 'course', '声乐一对一', courseSpec()),
                operationId: {
                    id: 'operation', operationNo: 'CONSUME-20260717-001',
                    sourceType: 'session', sourceId: 'session', requestSnapshot: { private: true },
                },
            },
        }],
        rules: [{
            id: 'rule', sourceCreditTypeId: 'universal', targetCreditTypeId: 'course',
            sourceQuantity: 300, targetQuantity: 1, minSourceQuantity: 300, maxSourceQuantity: 900,
            expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', reversible: true,
            validFrom: '2026-07-01T00:00:00Z', version: 2, status: 'active',
            expand: {
                sourceCreditTypeId: creditType('universal', 'universal', '通用课程点'),
                targetCreditTypeId: creditType('course', 'course', '声乐一对一'),
            },
        }],
        sessions: [{
            id: 'roster', sessionId: 'session', attendanceStatus: 'scheduled',
            creditStatus: 'conversion_required', eligibilityReason: 'universal credit available',
            expand: { sessionId: {
                id: 'session', code: 'S-1', title: '声乐课', status: 'scheduled',
                startAt: '2026-07-20T10:00:00Z', endAt: '2026-07-20T11:00:00Z',
                location: 'A1', requiredCreditTypeId: 'course', requiredQuantity: 1,
                expand: { requiredCreditTypeId: creditType('course', 'course', '声乐一对一', courseSpec()) },
            } },
        }],
    });
    const service = new CourseCreditQueryService(repository, { clock: () => NOW });

    const events = await service.listEvents('student', { eventType: 'CONSUME' });
    assert.equal(events.items[0].metadata, undefined);
    assert.equal(events.items[0].quantityDelta, -1);
    assert.deepEqual(events.items[0].source, {
        id: 'session', operationNo: 'CONSUME-20260717-001', type: 'session',
    });
    const rules = await service.listConversionRules();
    assert.equal(rules[0].sourceCreditType.kind, 'universal');
    assert.equal(rules[0].targetQuantity, 1);
    const sessions = await service.listSessions('student', { page: 1, perPage: 10 });
    assert.equal(sessions.items[0].session.title, '声乐课');
    assert.equal(sessions.items[0].creditStatus, 'conversion_required');
    assert.equal(sessions.items[0].requiredCreditType.courseSpec.id, 'spec');
});

test('query validation rejects foreign or malformed filters before storage reads', async () => {
    const service = new CourseCreditQueryService(mockRepository());
    await assert.rejects(service.summary(''), hasCode('STUDENT_ID_REQUIRED'));
    await assert.rejects(service.listBatches('student', { status: 'unknown' }), hasCode('BATCH_STATUS_INVALID'));
    await assert.rejects(service.listBatches('student', { page: 0 }), hasCode('PAGINATION_INVALID'));
    await assert.rejects(service.listBatches('student', { perPage: 101 }), hasCode('PER_PAGE_INVALID'));
    await assert.rejects(service.getBatch('student', ''), hasCode('BATCH_ID_REQUIRED'));
    await assert.rejects(service.listEvents('student', { eventType: 'UNKNOWN' }), hasCode('CREDIT_EVENT_TYPE_INVALID'));
});

test('query defaults omit optional filters and preserve empty result pages', async () => {
    const repository = mockRepository();
    const service = new CourseCreditQueryService(repository, { clock: () => NOW });

    assert.equal((await service.listBatches('student')).items.length, 0);
    assert.equal((await service.listEvents('student')).items.length, 0);
    assert.equal((await service.listSessions('student')).items.length, 0);
    assert.equal(repository.calls[0].options.filter, 'studentId="student"');
    assert.equal(repository.calls[1].options.filter, 'studentId="student"');
});

test('summary handles fallback relation ids and every expiry-window boundary', () => {
    const result = buildSummary([
        {
            creditTypeId: 'fallback', status: 'pending', availableQuantity: 1,
            effectiveExpiresAt: '2026-09-20T10:00:00Z',
        },
        {
            creditTypeId: 'fallback', status: 'active', availableQuantity: 2,
            effectiveExpiresAt: '2026-07-10T10:00:00Z',
        },
        {
            creditTypeId: 'fallback', status: 'active', availableQuantity: 0,
            frozenQuantity: 0, effectiveExpiresAt: '2026-07-18T10:00:00Z',
        },
        {
            creditTypeId: 'fallback', status: 'active', frozenQuantity: 3,
            effectiveExpiresAt: '2026-07-25T10:00:00Z',
        },
        {
            creditTypeId: 'fallback', status: 'active', availableQuantity: 1,
            effectiveExpiresAt: '2026-07-20T10:00:00Z',
        },
    ], NOW, 30);
    const item = result.items[0];

    assert.equal(item.creditType.id, 'fallback');
    assert.equal(item.unactivatedQuantity, 1);
    assert.equal(item.availableQuantity, 3);
    assert.equal(item.frozenQuantity, 3);
    assert.equal(item.expiringQuantity, 4);
    assert.equal(item.nearestExpiryAt, '2026-07-20T10:00:00.000Z');
});

test('query projection helpers cover empty relations and deterministic ordering', () => {
    assert.deepEqual(pagination(), { page: 1, perPage: 20 });
    assert.equal(positiveInteger(undefined, 4), 4);
    assert.equal(positiveInteger(null, 5), 5);
    assert.equal(positiveInteger('', 7), 7);
    assert.equal(quantity('3'), 3);
    assert.equal(quantity(-1), 0);
    assert.equal(relation({ expand: { item: [{ id: 'one' }] } }, 'item').id, 'one');
    assert.deepEqual(relation({ expand: { item: [] } }, 'item'), {});
    assert.equal(relationId([{ id: 'one' }]), 'one');
    assert.equal(relationId({ id: 'two' }), 'two');
    assert.equal(relationId(null), '');
    assert.equal(escapeFilter('a"b\\c'), 'a\\"b\\\\c');
    assert.deepEqual(mapPage({}, mapBatch), { page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [] });
    assert.equal(mapCreditType().id, '');
    assert.deepEqual(mapCreditType({}, 'fallback', { id: 'spec' }).courseSpec, {
        id: 'spec', code: '', name: '',
    });
    assert.equal(mapBatch({}).effectiveExpiresAt, null);
    assert.equal(mapEvent({}).quantityDelta, 0);
    assert.equal(mapEvent({}).source, null);
    assert.equal(mapConversionRule({}).maxSourceQuantity, null);
    assert.equal(mapSessionStudent({}).session.id, '');
    assert.equal(summaryOrder(
        { creditType: { kind: 'course', name: 'B' } },
        { creditType: { kind: 'course', name: 'A' } }
    ), 1);
    assert.equal(summaryOrder(
        { creditType: { kind: 'course', code: 'A' } },
        { creditType: { kind: 'universal', code: 'Z' } }
    ), 1);
    assert.equal(summaryOrder(
        { creditType: { kind: 'universal', id: 'U' } },
        { creditType: { kind: 'course', id: 'C' } }
    ), -1);
    assert.equal(summaryOrder(
        { creditType: { kind: 'course', code: 'B' } },
        { creditType: { kind: 'course', code: 'A' } }
    ), 1);
    assert.equal(summaryOrder(
        { creditType: { kind: 'course', id: 'B' } },
        { creditType: { kind: 'course', id: 'A' } }
    ), 1);
    assert.equal(buildSummary([], NOW, 30).items.length, 0);
});

function mockRepository(options = {}) {
    const repository = {
        calls: [],
        first: options.batches?.[0] || batch(),
        async list(collection, requestOptions) {
            this.calls.push({ method: 'list', collection, options: requestOptions });
            if (collection === 'conversion_rules') return options.rules || [];
            return options.batches || [];
        },
        async page(collection, page, perPage, requestOptions) {
            this.calls.push({ method: 'page', collection, page, perPage, options: requestOptions });
            const items = collection === 'credit_events' ? options.events || []
                : collection === 'session_students' ? options.sessions || []
                    : options.batches || [];
            return { page, perPage, totalItems: items.length, totalPages: items.length ? 1 : 0, items };
        },
        async findFirst(collection, filter, requestOptions) {
            this.calls.push({ method: 'findFirst', collection, filter, options: requestOptions });
            return this.first;
        },
    };
    return repository;
}

function batch(changes = {}) {
    const type = changes.creditType || creditType('course', 'course', '声乐一对一', courseSpec());
    return {
        id: 'batch', creditTypeId: 'course', sourceOperationId: 'operation',
        originalQuantity: 10, availableQuantity: 3, frozenQuantity: 1,
        consumedQuantity: 6, expiredQuantity: 0, reversedQuantity: 0,
        status: 'active', validFrom: '2026-07-01T00:00:00Z',
        activationMode: 'GRANT_TIME', created: '2026-07-01T00:00:00Z',
        grantSnapshot: { private: true },
        ...changes,
        expand: { creditTypeId: type },
    };
}

function creditType(id, kind, name, spec) {
    return {
        id, code: id.toUpperCase(), name, kind,
        ...(spec ? { courseSpecId: spec.id, expand: { courseSpecId: spec } } : {}),
    };
}

function courseSpec() {
    return { id: 'spec', code: 'VOCAL-1V1', name: '声乐一对一' };
}

function hasCode(code) {
    return (error) => error?.code === code;
}
