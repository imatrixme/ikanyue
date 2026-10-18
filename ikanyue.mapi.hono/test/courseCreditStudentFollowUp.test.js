const test = require('node:test');
const assert = require('node:assert/strict');

const { FOLLOW_UP_ACTION } = require('../src/services/courseCredits/opsQueryService');
const { StudentFollowUpService } = require('../src/services/courseCredits/studentFollowUpService');

const NOW = Date.parse('2026-10-18T02:00:00Z');

test('renewal follow-up is an append-only audit entry with a future snooze date', async () => {
    const repository = followUpRepository();
    const service = new StudentFollowUpService(repository, { clock: () => NOW, idFactory: () => 'follow-up' });
    const result = await service.record({
        studentId: 'student', status: 'contacted', note: `  ${'已电话联系，'.repeat(80)}  `,
        snoozeUntil: '2026-10-25T00:00:00+08:00', actorId: 'operator', actorRole: 'admin',
    });

    assert.equal(result.status, 'contacted');
    assert.equal(result.snoozeUntil, '2026-10-24T16:00:00.000Z');
    assert.equal(result.note.length, 300);
    const [operation] = repository.sent[0];
    assert.equal(operation.collection, 'ops_audit_logs');
    assert.equal(operation.data.action, FOLLOW_UP_ACTION);
    assert.equal(operation.data.resourceType, 'students');
    assert.equal(operation.data.resourceId, 'student');
    assert.equal(operation.data.actorRole, 'admin');
    assert.deepEqual(repository.students, ['student']);
});

test('renewal follow-up rejects unknown results, past snooze dates and missing students', async () => {
    const service = new StudentFollowUpService(followUpRepository(), { clock: () => NOW });
    const base = { studentId: 'student', status: 'declined', snoozeUntil: '2026-11-01T00:00:00Z' };
    await assert.rejects(service.record({ ...base, studentId: '' }), { code: 'STUDENT_ID_REQUIRED' });
    await assert.rejects(service.record({ ...base, status: 'renewed' }), { code: 'FOLLOW_UP_STATUS_INVALID' });
    await assert.rejects(service.record({ ...base, snoozeUntil: '2026-10-17T00:00:00Z' }), { code: 'FOLLOW_UP_SNOOZE_INVALID' });
    await assert.rejects(service.record({ ...base, snoozeUntil: 'later' }), { code: 'FOLLOW_UP_SNOOZE_INVALID' });
    await assert.rejects(service.record({ ...base, studentId: 'missing' }), /missing/);
    const teacher = await service.record({ ...base, actorRole: 'teacher' });
    assert.equal(teacher.note, '');
});

function followUpRepository() {
    return {
        sent: [],
        students: [],
        async get(collection, id) {
            assert.equal(collection, 'students');
            if (id === 'missing') throw new Error('missing');
            this.students.push(id);
            return { id };
        },
        async send(plan) {
            this.sent.push(plan);
        },
    };
}
