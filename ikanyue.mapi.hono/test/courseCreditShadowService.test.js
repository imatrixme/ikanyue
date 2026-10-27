const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditShadowService,
    compareRows,
    expectationMap,
    failedSession,
    normalizeExpectation,
    validateSessionIds,
} = require('../src/services/courseCredits/shadowService');

const NOW = '2026-08-18T08:00:00.000Z';

test('shadow run compares representative real sessions without any write path', async () => {
    const previews = [];
    const service = new CourseCreditShadowService({
        async previewSettlement(sessionId) { previews.push(sessionId); return actual(sessionId); },
    }, { clock: () => Date.parse(NOW) });
    const result = await service.run({ sessionIds: ['session-1'], expectations: [expected('session-1')] });

    assert.equal(result.status, 'passed');
    assert.equal(result.writeCount, 0);
    assert.equal(result.differenceCount, 0);
    assert.deepEqual(previews, ['session-1']);
    assert.equal(result.generatedAt, NOW);
});

test('shadow run reports every academic expectation discrepancy and preview failure', async () => {
    const service = new CourseCreditShadowService({
        async previewSettlement(sessionId) {
            if (sessionId === 'broken') throw Object.assign(new Error('invalid rules'), { code: 'TEACHER_RULE_INVALID' });
            return actual(sessionId);
        },
    });
    const mismatch = expected('session-1');
    mismatch.canSettle = false;
    mismatch.students[0].action = 'release';
    mismatch.teachers[0].quantity = 2;
    const result = await service.run({
        sessionIds: ['session-1', 'missing-expectation', 'broken'], expectations: [mismatch, expected('broken')],
    });

    assert.equal(result.status, 'failed');
    assert.ok(result.differenceCount >= 5);
    assert.ok(result.reports[0].differences.some((item) => item.code === 'CAN_SETTLE_MISMATCH'));
    assert.equal(result.reports[1].differences[0].code, 'EXPECTATION_MISSING');
    assert.equal(result.reports[2].differences[0].actual.errorCode, 'TEACHER_RULE_INVALID');
});

test('shadow validation rejects missing, excessive, duplicate, and malformed expectations', async () => {
    for (const [input, code] of [
        [{}, 'SHADOW_SESSION_IDS_REQUIRED'],
        [{ sessionIds: Array.from({ length: 101 }, (_, index) => `session-${index}`) }, 'SHADOW_SESSION_LIMIT_EXCEEDED'],
        [{ sessionIds: ['same', 'same'] }, 'SHADOW_SESSION_DUPLICATE'],
        [{ sessionIds: [''] }, 'SHADOW_SESSION_ID_INVALID'],
    ]) await assert.rejects(new CourseCreditShadowService({}).run(input), hasCode(code));
    assert.throws(() => expectationMap([expected('same'), expected('same')]), hasCode('SHADOW_EXPECTATION_DUPLICATE'));
    assert.throws(() => normalizeExpectation({ canSettle: true }), hasCode('SHADOW_EXPECTATION_SESSION_REQUIRED'));
    assert.throws(() => normalizeExpectation({ sessionId: 'session' }), hasCode('SHADOW_EXPECTATION_SETTLE_REQUIRED'));
    assert.throws(() => normalizeExpectation({ sessionId: 'session', canSettle: true, students: [{}] }),
        hasCode('SHADOW_EXPECTATION_ROW_INVALID'));
    assert.deepEqual(validateSessionIds([' session ']), ['session']);
});

test('shadow row comparison detects missing, unexpected, and exact numeric values', () => {
    assert.equal(compareRows([{ id: 'same', quantity: 1 }], [{ id: 'same', quantity: '1' }], 'id', ['quantity']).length, 0);
    const differences = compareRows([{ id: 'missing', action: 'consume' }], [{ id: 'extra', action: 'release' }], 'id', ['action']);
    assert.deepEqual(differences.map((item) => item.code), ['EXPECTED_ROW_MISSING', 'UNEXPECTED_ROW']);
    assert.deepEqual(compareRows([], undefined, 'id', ['action']), []);
});

test('shadow empty expectation and safe failure fallbacks remain deterministic', () => {
    assert.equal(expectationMap().size, 0);
    assert.deepEqual(normalizeExpectation({ sessionId: 'session', canSettle: false }), {
        canSettle: false, sessionId: 'session', students: [], teachers: [],
    });
    assert.deepEqual(failedSession('session', null, null), {
        actual: null,
        differences: [{
            actual: { errorCode: 'COURSE_CREDIT_INTERNAL_ERROR', message: '影子计算失败' },
            code: 'SHADOW_PREVIEW_FAILED', expected: null, field: 'session',
        }],
        expectationProvided: false, expected: null, sessionId: 'session',
    });
});

function actual(sessionId) {
    return {
        sessionId, canSettle: true, sessionStatus: 'completed',
        students: [{ sessionStudentId: 'student-row', studentId: 'student', action: 'consume', quantity: 1 }],
        teachers: [{ sessionTeacherId: 'teacher-row', teacherId: 'teacher', action: 'earn', quantity: 1 }],
    };
}

function expected(sessionId) {
    return {
        sessionId, canSettle: true,
        students: [{ sessionStudentId: 'student-row', action: 'consume' }],
        teachers: [{ sessionTeacherId: 'teacher-row', action: 'earn', quantity: 1 }],
    };
}

function hasCode(code) { return (error) => error.code === code; }
