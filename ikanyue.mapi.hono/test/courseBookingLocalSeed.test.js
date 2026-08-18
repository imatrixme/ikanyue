const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LOCAL_LESSON_QUANTITY,
    LOCAL_POLICY,
    LOCAL_TEACHER,
    assertLocalPocketBase,
    createGrantRecords,
    localTeacherCapabilitiesField,
    localTeacherCredentials,
    localRecordId,
} = require('../scripts/pb-seed-course-booking-local');

test('local course-booking seed creates stable PocketBase ids and a complete grant ledger', () => {
    const now = new Date('2026-07-30T04:00:00.000Z');
    const first = createGrantRecords({ studentId: 'student-a', creditTypeId: 'credit-a', now });
    const second = createGrantRecords({ studentId: 'student-a', creditTypeId: 'credit-a', now });

    assert.deepEqual(first, second);
    for (const id of [first.operation.id, first.batch.id, first.event.id]) {
        assert.match(id, /^[a-z0-9]{15}$/);
    }
    assert.equal(first.batch.sourceOperationId, first.operation.id);
    assert.equal(first.event.operationId, first.operation.id);
    assert.equal(first.event.batchId, first.batch.id);
    assert.equal(first.batch.availableQuantity, LOCAL_LESSON_QUANTITY);
    assert.equal(first.batch.status, 'active');
    assert.ok(Date.parse(first.batch.validFrom) < now.getTime());
    assert.ok(Date.parse(first.batch.effectiveExpiresAt) > now.getTime());
});

test('local seed safety rejects remote PocketBase hosts and validates booking defaults', () => {
    assert.doesNotThrow(() => assertLocalPocketBase('http://127.0.0.1:18090'));
    assert.doesNotThrow(() => assertLocalPocketBase('http://localhost:8090'));
    assert.throws(() => assertLocalPocketBase('https://pb.example.com'), /Refusing to seed non-local/);
    assert.equal(localRecordId('bt', 'same'), localRecordId('bt', 'same'));
    assert.notEqual(localRecordId('bt', 'same'), localRecordId('bt', 'other'));
    assert.equal(LOCAL_POLICY.timezone, 'Asia/Shanghai');
    assert.equal(LOCAL_POLICY.claimGranularityMinutes, 15);
    assert.ok(LOCAL_POLICY.defaultWindows.length > 0);
    assert.deepEqual(LOCAL_TEACHER.courseCreditCapabilities, ['course_credit.teacher']);
    assert.deepEqual(localTeacherCapabilitiesField(), {
        name: 'courseCreditCapabilities',
        type: 'json',
        required: false,
    });
    assert.deepEqual(localTeacherCredentials('admin870329'), {
        password: 'admin870329',
        passwordConfirm: 'admin870329',
    });
});
