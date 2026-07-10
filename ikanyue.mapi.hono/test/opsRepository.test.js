const assert = require('node:assert/strict');
const test = require('node:test');
const { OpsRepository } = require('../src/services/ops/opsRepository');

test('ops repository disables PocketBase auto-cancellation for shared server requests', async () => {
    const calls = [];
    const collection = {
        async create(data, options) { calls.push(['create', data, options]); },
        async delete(id, options) { calls.push(['delete', id, options]); },
        async getList(page, perPage, options) { calls.push(['list', page, perPage, options]); },
        async getOne(id, options) { calls.push(['get', id, options]); },
        async update(id, data, options) { calls.push(['update', id, data, options]); },
    };
    const repository = new OpsRepository({ collection: () => collection });

    await repository.list('students', 1, 20, { filter: 'id != ""' });
    await repository.get('students', 'student_1', { expand: 'profile' });
    await repository.create('students', { name: 'A' });
    await repository.update('students', 'student_1', { name: 'B' });
    await repository.delete('students', 'student_1');

    assert.deepEqual(calls[0][3], { filter: 'id != ""', requestKey: null });
    assert.deepEqual(calls[1][2], { expand: 'profile', requestKey: null });
    assert.deepEqual(calls[2][2], { requestKey: null });
    assert.deepEqual(calls[3][3], { requestKey: null });
    assert.deepEqual(calls[4][2], { requestKey: null });
});
