const test = require('node:test');
const assert = require('node:assert/strict');

const {
    FEFO_SORT,
    buildFefoFilter,
    escapeFilter,
    findFefoCandidateBatches,
    findIdempotentOperation,
    fingerprintRequest,
    normalizeOperation,
    resolveStoredOperation,
} = require('../src/services/courseCredits/repositories');

test('idempotency repository scopes, escapes, and finds stored operations', async () => {
    let filter;
    const record = { id: 'op', status: 'committed' };
    const pb = operationPb(async (value) => { filter = value; return record; });
    assert.equal(await findIdempotentOperation(pb, 'reserve', 'a"b\\c'), record);
    assert.equal(filter, 'idempotencyKey="reserve:a\\"b\\\\c"');
    assert.equal(escapeFilter('a"b\\c'), 'a\\"b\\\\c');
});

test('idempotency repository distinguishes not found from infrastructure failures', async () => {
    assert.equal(await findIdempotentOperation(operationPb(async () => { throw { status: 404 }; }), 'grant', 'key'), null);
    await assert.rejects(
        findIdempotentOperation(operationPb(async () => { throw new Error('database unavailable'); }), 'grant', 'key'),
        /database unavailable/
    );
});

test('request fingerprints are stable and stored results are replayed', async () => {
    const request = { b: 2, a: { y: 2, x: 1 } };
    assert.equal(fingerprintRequest(request), fingerprintRequest({ a: { x: 1, y: 2 }, b: 2 }));
    assert.notEqual(fingerprintRequest(request), fingerprintRequest({ ...request, b: 3 }));
    const requestHash = fingerprintRequest(request);
    const record = {
        id: 'op',
        status: 'committed',
        requestSnapshot: { requestHash },
        resultSnapshot: { batchIds: ['batch'] },
    };
    const result = await resolveStoredOperation(operationPb(async () => record), 'grant', 'key', request);
    assert.equal(result.action, 'replay');
    assert.deepEqual(result.result, record.resultSnapshot);
    assert.deepEqual(normalizeOperation(record), {
        id: 'op', status: 'committed', requestHash, resultSnapshot: record.resultSnapshot,
    });
    assert.equal(normalizeOperation(null), null);

    const execute = await resolveStoredOperation(operationPb(async () => { throw { status: 404 }; }), 'grant', 'new', request);
    assert.equal(execute.action, 'execute');
});

test('FEFO repository builds service-time filter and returns deterministic ordering', async () => {
    let options;
    const records = [
        batch('later', '2026-06-01', 0, '2026-01-01'),
        batch('priority', '2026-05-01', 2, '2026-01-01'),
        batch('first', '2026-05-01', 1, '2026-01-01'),
    ];
    const pb = {
        collection(name) {
            assert.equal(name, 'credit_batches');
            return {
                async getFullList(value) { options = value; return records; },
            };
        },
    };
    const result = await findFefoCandidateBatches(pb, {
        studentId: 'student"1',
        creditTypeId: 'credit\\1',
        sessionStart: '2026-04-01T10:00:00Z',
        batchSize: 50,
    });
    assert.deepEqual(result.map((item) => item.id), ['first', 'priority', 'later']);
    assert.equal(options.sort, FEFO_SORT);
    assert.equal(options.batch, 50);
    assert.match(options.filter, /studentId="student\\"1"/);
    assert.match(options.filter, /creditTypeId="credit\\\\1"/);
    assert.match(options.filter, /effectiveExpiresAt/);
    assert.match(options.filter, /activationDeadline/);
});

test('FEFO filter uses default batch size and validates session date', async () => {
    let options;
    const pb = { collection() { return { async getFullList(value) { options = value; return []; } }; } };
    await findFefoCandidateBatches(pb, { studentId: 's', creditTypeId: 'c', sessionStart: '2026-01-01' });
    assert.equal(options.batch, 200);
    assert.match(options.filter, /validFrom<="2026-01-01 00:00:00\.000Z"/);
    assert.match(options.filter, /effectiveExpiresAt>"2026-01-01 00:00:00\.000Z"/);
    assert.match(options.filter, /activationDeadline>"2026-01-01 00:00:00\.000Z"/);
    assert.throws(() => buildFefoFilter({ studentId: 's', creditTypeId: 'c', sessionStart: null }), /sessionStart must be a valid date/);
});

function operationPb(getFirstListItem) {
    return {
        collection(name) {
            assert.equal(name, 'credit_operations');
            return { getFirstListItem };
        },
    };
}

function batch(id, effectiveExpiresAt, priority, created) {
    return { id, effectiveExpiresAt, priority, created };
}
