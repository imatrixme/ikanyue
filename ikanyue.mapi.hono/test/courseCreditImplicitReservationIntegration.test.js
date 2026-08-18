const test = require('node:test');
const assert = require('node:assert/strict');

const { conversionTermsFingerprint } = require('../src/services/courseCredits/domain');
const { PocketBaseBatchRepository } = require('../src/services/courseCredits/repositories');
const { CourseCreditReservationService } = require('../src/services/courseCredits/reservationService');
const {
    connectLocalPocketBase,
    deleteByFilter,
    deleteOne,
    integrationMarker,
} = require('./support/courseCreditPocketBaseIntegration');

test('real PocketBase atomically converts authorized credits and reserves the lesson', {
    skip: process.env.PB_COURSE_CREDIT_INTEGRATION !== '1',
}, async () => {
    const pb = await connectLocalPocketBase();
    const marker = integrationMarker('implicit');
    const created = {
        operationIds: [], sessionStudentIds: [], sessionIds: [], sourceBatchIds: [], targetBatchIds: [],
    };
    try {
        const student = await ensureStudent(pb, marker, created);
        const catalog = await createCatalog(pb, marker, created);
        const rule = await pb.collection('conversion_rules').create({
            sourceCreditTypeId: catalog.universal.id,
            targetCreditTypeId: catalog.course.id,
            sourceQuantity: 100,
            targetQuantity: 1,
            minSourceQuantity: 100,
            maxSourceQuantity: 1000,
            expiryPolicy: 'INHERIT_SOURCE',
            activationMode: 'GRANT_TIME',
            validityDurationDays: 0,
            activationDeadlineDays: 0,
            reversible: false,
            referenceValueLimit: 1,
            validFrom: '2026-01-01T00:00:00Z',
            version: 1,
            status: 'active',
        }, { requestKey: null });
        created.ruleId = rule.id;
        const authorization = await pb.collection('conversion_authorizations').create({
            studentId: student.id,
            ruleId: rule.id,
            sourceCreditTypeId: rule.sourceCreditTypeId,
            targetCreditTypeId: rule.targetCreditTypeId,
            termsFingerprint: conversionTermsFingerprint(rule),
            requestFingerprint: `it-auth-${marker}`,
            status: 'active',
            consentSource: 'explicit_preview',
            idempotencyKey: `it-auth-${marker}`,
            validFrom: '2026-01-01T00:00:00Z',
            validTo: '2027-01-01T00:00:00Z',
        }, { requestKey: null });
        created.authorizationId = authorization.id;
        const sourceOperation = await createSourceOperation(pb, student.id, marker);
        created.sourceOperationId = sourceOperation.id;

        const successSource = await createSourceBatch(pb, student.id, catalog.universal.id,
            sourceOperation.id, 'success');
        created.sourceBatchIds.push(successSource.id);
        const successSession = await createSessionFixture(
            pb, student.id, catalog.course.id, catalog.courseSpec.id, marker, 'success'
        );
        created.sessionIds.push(successSession.session.id);
        created.sessionStudentIds.push(successSession.sessionStudent.id);

        const repository = new PocketBaseBatchRepository(pb);
        const success = await new CourseCreditReservationService(repository).reserveSessionCredit({
            authorizationId: authorization.id,
            idempotencyKey: `it-implicit-success-${marker}`,
            sessionStudentId: successSession.sessionStudent.id,
            studentId: student.id,
            actorId: student.id,
            actorRole: 'student',
        });
        created.operationIds.push(success.operationId);
        created.targetBatchIds.push(...success.conversion.targets.map((target) => target.targetBatchId));
        assert.equal((await new CourseCreditReservationService(repository).reserveSessionCredit({
            authorizationId: authorization.id,
            idempotencyKey: `it-implicit-success-${marker}`,
            sessionStudentId: successSession.sessionStudent.id,
            studentId: student.id,
            actorId: student.id,
        })).replayed, true);

        const [storedSource, storedTarget, storedRoster, conversionAllocations, sessionAllocations, events] = await Promise.all([
            pb.collection('credit_batches').getOne(successSource.id, { requestKey: null }),
            pb.collection('credit_batches').getOne(created.targetBatchIds[0], { requestKey: null }),
            pb.collection('session_students').getOne(successSession.sessionStudent.id, { requestKey: null }),
            pb.collection('conversion_allocations').getFullList({
                filter: `operationId="${success.operationId}"`, requestKey: null,
            }),
            pb.collection('session_credit_allocations').getFullList({
                filter: `operationId="${success.operationId}"`, requestKey: null,
            }),
            pb.collection('credit_events').getFullList({
                filter: `operationId="${success.operationId}"`, sort: 'created', requestKey: null,
            }),
        ]);
        assert.equal(storedSource.availableQuantity, 0);
        assert.equal(storedSource.consumedQuantity, 200);
        assert.equal(storedTarget.availableQuantity, 0);
        assert.equal(storedTarget.frozenQuantity, 2);
        assert.equal(storedRoster.creditStatus, 'reserved');
        assert.equal(conversionAllocations.length, 1);
        assert.equal(sessionAllocations.length, 1);
        assert.deepEqual(events.map((event) => event.eventType), ['CONVERT_OUT', 'CONVERT_IN', 'FREEZE']);

        const rollbackSource = await createSourceBatch(pb, student.id, catalog.universal.id,
            sourceOperation.id, 'rollback');
        created.sourceBatchIds.push(rollbackSource.id);
        const rollbackSession = await createSessionFixture(
            pb, student.id, catalog.course.id, catalog.courseSpec.id, marker, 'rollback'
        );
        created.sessionIds.push(rollbackSession.session.id);
        created.sessionStudentIds.push(rollbackSession.sessionStudent.id);
        const failingRepository = failingBatchRepository(repository);
        await assert.rejects(new CourseCreditReservationService(failingRepository).reserveSessionCredit({
            authorizationId: authorization.id,
            idempotencyKey: `it-implicit-rollback-${marker}`,
            sessionStudentId: rollbackSession.sessionStudent.id,
            studentId: student.id,
            actorId: student.id,
        }));

        const [rolledSource, rolledRoster, rolledOperation, rolledAllocations] = await Promise.all([
            pb.collection('credit_batches').getOne(rollbackSource.id, { requestKey: null }),
            pb.collection('session_students').getOne(rollbackSession.sessionStudent.id, { requestKey: null }),
            pb.collection('credit_operations').getFullList({
                filter: `idempotencyKey="reserveSessionCredit:it-implicit-rollback-${marker}"`, requestKey: null,
            }),
            pb.collection('session_credit_allocations').getFullList({
                filter: `sessionStudentId="${rollbackSession.sessionStudent.id}"`, requestKey: null,
            }),
        ]);
        assert.equal(rolledSource.availableQuantity, 200);
        assert.equal(rolledSource.consumedQuantity, 0);
        assert.equal(rolledRoster.creditStatus, 'pending');
        assert.equal(rolledOperation.length, 0);
        assert.equal(rolledAllocations.length, 0);
    } finally {
        await cleanup(pb, created);
    }
});

function failingBatchRepository(repository) {
    return {
        get: (...args) => repository.get(...args),
        list: (...args) => repository.list(...args),
        findFirst: (...args) => repository.findFirst(...args),
        send: (plan) => repository.send([
            ...plan,
            { action: 'create', collection: 'outbox_events', data: {} },
        ]),
    };
}

async function ensureStudent(pb, marker, created) {
    const list = await pb.collection('students').getList(1, 1, { requestKey: null });
    if (list.items[0]) return list.items[0];
    const student = await pb.collection('students').create({ sn: `it-student-${marker}` }, { requestKey: null });
    created.studentId = student.id;
    return student;
}

async function createCatalog(pb, marker, created) {
    const courseSpec = await pb.collection('course_specs').create({
        code: `IT-IMPLICIT-${marker}`, name: `Implicit ${marker}`, deliveryMode: 'group',
        durationMinutes: 60, teacherTier: 'integration', status: 'active',
    }, { requestKey: null });
    created.courseSpecId = courseSpec.id;
    const universal = await pb.collection('credit_types').create({
        code: `IT-IMPLICIT-U-${marker}`, name: `Universal ${marker}`, kind: 'universal',
        consumable: false, unitLabel: 'value', referenceUnitValue: 1, status: 'active',
    }, { requestKey: null });
    const course = await pb.collection('credit_types').create({
        code: `IT-IMPLICIT-C-${marker}`, name: `Course ${marker}`, kind: 'course',
        courseSpecId: courseSpec.id, consumable: true, unitLabel: 'lesson',
        referenceUnitValue: 100, status: 'active',
    }, { requestKey: null });
    created.creditTypeIds = [universal.id, course.id];
    return { course, courseSpec, universal };
}

async function createSourceOperation(pb, studentId, marker) {
    return pb.collection('credit_operations').create({
        operationNo: `it-implicit-source-${marker}`, studentId, type: 'grant', status: 'committed',
        idempotencyKey: `it-implicit-source-${marker}`, sourceType: 'integration', sourceId: marker,
        requestSnapshot: {}, resultSnapshot: {}, actorId: 'integration-test', actorRole: 'service',
        reason: 'integration_setup', outcome: 'committed',
        beforeSummary: { integration: marker }, afterSummary: { integration: marker },
    }, { requestKey: null });
}

async function createSourceBatch(pb, studentId, creditTypeId, operationId, suffix) {
    return pb.collection('credit_batches').create({
        studentId, creditTypeId, sourceOperationId: operationId,
        originalQuantity: 200, availableQuantity: 200, frozenQuantity: 0,
        consumedQuantity: 0, expiredQuantity: 0, reversedQuantity: 0, status: 'active',
        validFrom: '2026-01-01T00:00:00Z', originalExpiresAt: '2026-12-31T00:00:00Z',
        effectiveExpiresAt: '2026-12-31T00:00:00Z', activationMode: 'GRANT_TIME',
        expiryPolicy: 'FIXED_DURATION', activatedAt: '2026-01-01T00:00:00Z',
        validityDurationDays: 365, grantSnapshot: { suffix }, listUnitValue: 1,
        paidUnitCost: 1, currency: 'CNY', version: 1,
    }, { requestKey: null });
}

async function createSessionFixture(pb, studentId, creditTypeId, courseSpecId, marker, suffix) {
    const startAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const endAt = new Date(Date.now() + 2 * 86400000 + 3600000).toISOString();
    const session = await pb.collection('sessions').create({
        code: `IT-IMPLICIT-${suffix}-${marker}`, title: `Implicit ${suffix} ${marker}`,
        status: 'scheduled', originType: 'admin',
        startAt, endAt,
        requiredCreditTypeId: creditTypeId, requiredQuantity: 2,
        attendanceRuleSnapshot: {
            version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume',
        },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
        teacherRuleSnapshot: {
            version: 1,
            rules: {
                lead: {
                    ruleId: 'implicit-integration-lead',
                    courseSpecId,
                    baseQuantity: 1,
                    durationFactor: 0,
                    participantFactor: 0,
                },
            },
        },
        rosterVersion: 1, version: 1,
    }, { requestKey: null });
    const sessionStudent = await pb.collection('session_students').create({
        sessionId: session.id, studentId, sourceClassIds: [], attendanceStatus: 'scheduled',
        creditStatus: 'pending', version: 1,
    }, { requestKey: null });
    return { session, sessionStudent };
}

async function cleanup(pb, created) {
    for (const sessionStudentId of created.sessionStudentIds.reverse()) {
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${sessionStudentId}"`);
        await deleteByFilter(pb, 'session_credit_allocations', `sessionStudentId="${sessionStudentId}"`);
        await deleteOne(pb, 'session_students', sessionStudentId);
    }
    for (const sessionId of created.sessionIds.reverse()) await deleteOne(pb, 'sessions', sessionId);
    for (const operationId of created.operationIds) {
        await deleteByFilter(pb, 'conversion_allocations', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'credit_events', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'credit_version_claims', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${operationId}"`);
    }
    for (const batchId of [...created.targetBatchIds, ...created.sourceBatchIds].reverse()) {
        await deleteOne(pb, 'credit_batches', batchId);
    }
    for (const operationId of created.operationIds.reverse()) await deleteOne(pb, 'credit_operations', operationId);
    await deleteOne(pb, 'credit_operations', created.sourceOperationId);
    await deleteOne(pb, 'conversion_authorizations', created.authorizationId);
    await deleteOne(pb, 'conversion_rules', created.ruleId);
    for (const id of (created.creditTypeIds || []).reverse()) await deleteOne(pb, 'credit_types', id);
    await deleteOne(pb, 'course_specs', created.courseSpecId);
    await deleteOne(pb, 'students', created.studentId);
}
