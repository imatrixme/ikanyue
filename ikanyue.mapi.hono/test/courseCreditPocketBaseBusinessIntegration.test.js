const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditGrantService } = require('../src/services/courseCredits/grantService');
const { CourseCreditBatchLifecycleService } = require('../src/services/courseCredits/batchLifecycleService');
const { CourseCreditConversionService } = require('../src/services/courseCredits/conversionService');
const { CourseCreditReservationService } = require('../src/services/courseCredits/reservationService');
const { PocketBaseBatchRepository } = require('../src/services/courseCredits/repositories/sdkBatchRepository');

test('real PocketBase SDK batch grants and reserves without business hooks', {
    skip: process.env.PB_COURSE_CREDIT_INTEGRATION !== '1',
}, async (t) => {
    const url = process.env.PB_URL;
    const email = process.env.PB_EMAIL;
    const password = process.env.PB_PASSWORD;
    assert.ok(url && email && password, 'PB_URL, PB_EMAIL, and PB_PASSWORD are required');
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname),
        'integration test only accepts loopback PocketBase');

    const PocketBase = await import('pocketbase');
    const pb = new PocketBase.default(url);
    await pb.collection('_superusers').authWithPassword(email, password);
    const students = await pb.collection('students').getList(1, 1, { requestKey: null });
    if (students.totalItems === 0) {
        t.skip('local production copy has no student record');
        return;
    }

    const marker = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const created = {
        conversionOperationIds: [], conversionRuleIds: [], extraBatchIds: [], extraCreditTypeIds: [],
        lifecycleOperationIds: [], reservationOperationIds: [],
        sessionStudents: [], sessions: [],
    };
    try {
        created.courseSpec = await pb.collection('course_specs').create({
            code: `IT-${marker}`,
            name: `Integration ${marker}`,
            deliveryMode: 'one_to_one',
            durationMinutes: 60,
            teacherTier: 'integration',
            status: 'active',
        }, { requestKey: null });
        created.creditType = await pb.collection('credit_types').create({
            code: `IT-CREDIT-${marker}`,
            name: `Integration credit ${marker}`,
            kind: 'course',
            courseSpecId: created.courseSpec.id,
            consumable: true,
            unitLabel: 'lesson',
            referenceUnitValue: 300,
            status: 'active',
        }, { requestKey: null });
        created.order = await pb.collection('orders').create({
            orderNo: `IT-ORDER-${marker}`,
            studentId: students.items[0].id,
            type: 'package_purchase',
            channel: 'admin',
            status: 'paid',
            currency: 'CNY',
            listAmount: 600,
            paidAmount: 560,
            productSnapshot: { integration: marker },
            grantSnapshot: { lines: [{
                creditTypeId: created.creditType.id,
                quantity: 2,
                activationMode: 'FIRST_RESERVATION',
                activationDeadlineDays: 30,
                validityDurationDays: 30,
                expiryPolicy: 'FIXED_DURATION',
                listUnitValue: 300,
                paidUnitCost: 280,
                currency: 'CNY',
            }] },
            idempotencyKey: `it-order-${marker}`,
            paidAt: new Date().toISOString(),
            version: 1,
        }, { requestKey: null });

        const repository = new PocketBaseBatchRepository(pb);
        const grant = await new CourseCreditGrantService(repository).grantOrderCredits({
            orderId: created.order.id,
            idempotencyKey: `it-grant-${marker}`,
            actorId: 'integration-test',
        });
        created.grantOperationId = grant.operationId;
        created.batchId = grant.batches[0].batchId;

        const first = await createSessionFixture(pb, {
            creditTypeId: created.creditType.id,
            marker,
            studentId: students.items[0].id,
            suffix: 'first',
        });
        created.sessions.push(first.session);
        created.sessionStudents.push(first.sessionStudent);

        const reservation = await new CourseCreditReservationService(repository).reserveSessionCredit({
            sessionStudentId: first.sessionStudent.id,
            idempotencyKey: `it-reserve-${marker}`,
            actorId: 'integration-test',
        });
        created.reservationOperationIds.push(reservation.operationId);

        const [order, batch, sessionStudent, events] = await Promise.all([
            pb.collection('orders').getOne(created.order.id, { requestKey: null }),
            pb.collection('credit_batches').getOne(created.batchId, { requestKey: null }),
            pb.collection('session_students').getOne(first.sessionStudent.id, { requestKey: null }),
            pb.collection('credit_events').getFullList({
                filter: `batchId="${created.batchId}"`, sort: 'created', requestKey: null,
            }),
        ]);
        assert.equal(order.status, 'granted');
        assert.equal(batch.availableQuantity, 1);
        assert.equal(batch.frozenQuantity, 1);
        assert.ok(batch.activatedAt);
        assert.equal(sessionStudent.creditStatus, 'reserved');
        assert.deepEqual(events.map((event) => event.eventType), ['GRANT', 'ACTIVATE', 'FREEZE']);

        const competitors = await Promise.all(['second', 'third'].map((suffix) => createSessionFixture(pb, {
            creditTypeId: created.creditType.id,
            marker,
            studentId: students.items[0].id,
            suffix,
        })));
        for (const fixture of competitors) {
            created.sessions.push(fixture.session);
            created.sessionStudents.push(fixture.sessionStudent);
        }
        const concurrentResults = await Promise.all(competitors.map((fixture, index) => (
            new CourseCreditReservationService(repository).reserveSessionCredit({
                sessionStudentId: fixture.sessionStudent.id,
                idempotencyKey: `it-concurrent-${marker}-${index}`,
                actorId: 'integration-test',
            })
        )));
        created.reservationOperationIds.push(...concurrentResults.map((result) => result.operationId));
        assert.deepEqual(concurrentResults.map((result) => result.creditStatus).sort(), [
            'credit_insufficient', 'reserved',
        ]);
        const finalBatch = await pb.collection('credit_batches').getOne(created.batchId, { requestKey: null });
        assert.equal(finalBatch.availableQuantity, 0);
        assert.equal(finalBatch.frozenQuantity, 2);

        const universalType = await pb.collection('credit_types').create({
            code: `IT-UNIVERSAL-${marker}`,
            name: `Integration universal ${marker}`,
            kind: 'universal',
            consumable: false,
            unitLabel: 'value',
            referenceUnitValue: 1,
            status: 'active',
        }, { requestKey: null });
        created.extraCreditTypeIds.push(universalType.id);
        created.conversionRule = await pb.collection('conversion_rules').create({
            sourceCreditTypeId: universalType.id,
            targetCreditTypeId: created.creditType.id,
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
        created.conversionRuleIds.push(created.conversionRule.id);
        created.conversionSourceOperation = await pb.collection('credit_operations').create({
            operationNo: `it-conversion-source-${marker}`,
            studentId: students.items[0].id,
            type: 'grant',
            status: 'committed',
            idempotencyKey: `it-conversion-source-${marker}`,
            sourceType: 'integration',
            sourceId: marker,
            requestSnapshot: {},
            resultSnapshot: {},
            reason: 'integration_setup',
            outcome: 'committed',
            beforeSummary: {},
            afterSummary: {},
            actorId: 'integration-test',
            actorRole: 'service',
        }, { requestKey: null });
        const conversionSource = await pb.collection('credit_batches').create({
            studentId: students.items[0].id,
            creditTypeId: universalType.id,
            sourceOperationId: created.conversionSourceOperation.id,
            originalQuantity: 200,
            availableQuantity: 200,
            frozenQuantity: 0,
            consumedQuantity: 0,
            expiredQuantity: 0,
            reversedQuantity: 0,
            status: 'active',
            validFrom: '2026-01-01T00:00:00Z',
            originalExpiresAt: '2026-12-31T00:00:00Z',
            effectiveExpiresAt: '2026-12-31T00:00:00Z',
            activationMode: 'GRANT_TIME',
            expiryPolicy: 'FIXED_DURATION',
            activatedAt: '2026-01-01T00:00:00Z',
            validityDurationDays: 364,
            grantSnapshot: { integration: marker },
            listUnitValue: 1,
            paidUnitCost: 0.9,
            currency: 'CNY',
            version: 1,
        }, { requestKey: null });
        created.extraBatchIds.push(conversionSource.id);
        const conversionService = new CourseCreditConversionService(repository);
        const conversionInput = {
            studentId: students.items[0].id,
            ruleId: created.conversionRule.id,
            sourceQuantity: 200,
        };
        const conversionPreview = await conversionService.previewConversion(conversionInput);
        const converted = await conversionService.convertCredits({
            ...conversionInput,
            previewAt: conversionPreview.previewAt,
            previewHash: conversionPreview.previewHash,
            idempotencyKey: `it-convert-${marker}`,
            actorId: 'integration-test',
        });
        created.conversionOperationIds.push(converted.operationId, created.conversionSourceOperation.id);
        created.extraBatchIds.push(...converted.targets.map((target) => target.targetBatchId));
        const [convertedSource, conversionAllocations] = await Promise.all([
            pb.collection('credit_batches').getOne(conversionSource.id, { requestKey: null }),
            pb.collection('conversion_allocations').getFullList({
                filter: `operationId="${converted.operationId}"`, requestKey: null,
            }),
        ]);
        assert.equal(convertedSource.availableQuantity, 0);
        assert.equal(convertedSource.consumedQuantity, 200);
        assert.equal(converted.targetQuantity, 2);
        assert.equal(conversionAllocations.length, 1);

        const authorizedSource = await pb.collection('credit_batches').create({
            studentId: students.items[0].id,
            creditTypeId: universalType.id,
            sourceOperationId: created.conversionSourceOperation.id,
            originalQuantity: 100,
            availableQuantity: 100,
            frozenQuantity: 0,
            consumedQuantity: 0,
            expiredQuantity: 0,
            reversedQuantity: 0,
            status: 'active',
            validFrom: '2026-01-01T00:00:00Z',
            originalExpiresAt: '2026-12-31T00:00:00Z',
            effectiveExpiresAt: '2026-12-31T00:00:00Z',
            activationMode: 'GRANT_TIME',
            expiryPolicy: 'FIXED_DURATION',
            activatedAt: '2026-01-01T00:00:00Z',
            validityDurationDays: 364,
            grantSnapshot: { integration: `${marker}-authorized` },
            listUnitValue: 1,
            paidUnitCost: 0.9,
            currency: 'CNY',
            version: 1,
        }, { requestKey: null });
        created.extraBatchIds.push(authorizedSource.id);
        const authorization = await conversionService.authorizeAutomaticConversion({
            studentId: students.items[0].id,
            ruleId: created.conversionRule.id,
            validTo: new Date(Date.now() + 86400000).toISOString(),
            idempotencyKey: `it-authorize-${marker}`,
            consentSource: 'standing_authorization',
        });
        const authorizedConversion = await conversionService.convertCredits({
            studentId: students.items[0].id,
            ruleId: created.conversionRule.id,
            sourceQuantity: 100,
            authorizationId: authorization.authorizationId,
            idempotencyKey: `it-authorized-convert-${marker}`,
            actorId: 'integration-test',
        });
        created.conversionOperationIds.push(authorizedConversion.operationId);
        created.extraBatchIds.push(...authorizedConversion.targets.map((target) => target.targetBatchId));
        assert.equal(authorizedConversion.targetQuantity, 1);

        created.expiredSourceOperation = await pb.collection('credit_operations').create({
            operationNo: `it-expired-source-${marker}`,
            studentId: students.items[0].id,
            type: 'grant',
            status: 'committed',
            idempotencyKey: `it-expired-source-${marker}`,
            sourceType: 'integration',
            sourceId: marker,
            requestSnapshot: {},
            resultSnapshot: {},
            reason: 'integration_setup',
            outcome: 'committed',
            beforeSummary: {},
            afterSummary: {},
            actorId: 'integration-test',
            actorRole: 'service',
        }, { requestKey: null });
        const expiredSource = await pb.collection('credit_batches').create({
            studentId: students.items[0].id,
            creditTypeId: created.creditType.id,
            sourceOperationId: created.expiredSourceOperation.id,
            originalQuantity: 3,
            availableQuantity: 0,
            frozenQuantity: 0,
            consumedQuantity: 0,
            expiredQuantity: 3,
            reversedQuantity: 0,
            status: 'expired',
            validFrom: '2026-01-01T00:00:00Z',
            originalExpiresAt: '2026-06-01T00:00:00Z',
            effectiveExpiresAt: '2026-06-01T00:00:00Z',
            activationMode: 'GRANT_TIME',
            expiryPolicy: 'FIXED_DURATION',
            activatedAt: '2026-01-01T00:00:00Z',
            validityDurationDays: 151,
            grantSnapshot: { integration: marker },
            currency: 'CNY',
            version: 1,
        }, { requestKey: null });
        created.extraBatchIds.push(expiredSource.id);
        const lifecycle = new CourseCreditBatchLifecycleService(repository);
        const restored = await lifecycle.restoreExpiredQuantity({
            batchId: expiredSource.id,
            quantity: 2,
            validityDurationDays: 30,
            reason: 'integration compensation',
            actorId: 'integration-test',
            approvedBy: 'integration-supervisor',
            idempotencyKey: `it-compensate-${marker}`,
        });
        created.lifecycleOperationIds.push(restored.operationId);
        created.extraBatchIds.push(restored.compensationBatchId);
        const compensationBefore = await pb.collection('credit_batches').getOne(
            restored.compensationBatchId, { requestKey: null }
        );
        const extended = await lifecycle.extendBatchExpiry({
            batchId: restored.compensationBatchId,
            newExpiresAt: new Date(Date.parse(compensationBefore.effectiveExpiresAt) + 30 * 86400000).toISOString(),
            reason: 'integration extension',
            actorId: 'integration-test',
            approvedBy: 'integration-supervisor',
            idempotencyKey: `it-extend-${marker}`,
        });
        created.lifecycleOperationIds.push(extended.operationId);
        const [expiredAfter, compensationAfter] = await Promise.all([
            pb.collection('credit_batches').getOne(expiredSource.id, { requestKey: null }),
            pb.collection('credit_batches').getOne(restored.compensationBatchId, { requestKey: null }),
        ]);
        assert.equal(expiredAfter.expiredQuantity, 3);
        assert.equal(compensationAfter.originalExpiresAt, compensationBefore.originalExpiresAt);
        assert.equal(Date.parse(compensationAfter.effectiveExpiresAt), Date.parse(extended.newExpiresAt));
    } finally {
        await cleanup(pb, created);
    }
});

async function cleanup(pb, created) {
    const operationIds = [
        created.grantOperationId,
        ...created.reservationOperationIds,
        ...created.conversionOperationIds,
        ...created.lifecycleOperationIds,
        created.expiredSourceOperation?.id,
    ].filter(Boolean);
    if (created.order?.id) await deleteByFilter(pb, 'outbox_events', `aggregateId="${created.order.id}"`);
    for (const sessionStudent of created.sessionStudents) {
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${sessionStudent.id}"`);
    }
    for (const operationId of operationIds) {
        await deleteByFilter(pb, 'session_credit_allocations', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'conversion_allocations', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'credit_events', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'credit_version_claims', `operationId="${operationId}"`);
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${operationId}"`);
    }
    for (const sessionStudent of created.sessionStudents.reverse()) {
        await deleteOne(pb, 'session_students', sessionStudent.id);
    }
    for (const session of created.sessions.reverse()) await deleteOne(pb, 'sessions', session.id);
    await deleteOne(pb, 'credit_batches', created.batchId);
    for (const batchId of created.extraBatchIds.reverse()) {
        await deleteByFilter(pb, 'outbox_events', `aggregateId="${batchId}"`);
        await deleteByFilter(pb, 'credit_expiry_changes', `batchId="${batchId}"`);
        await deleteOne(pb, 'credit_batches', batchId);
    }
    for (const operationId of operationIds.reverse()) await deleteOne(pb, 'credit_operations', operationId);
    await deleteOne(pb, 'orders', created.order?.id);
    for (const ruleId of created.conversionRuleIds.reverse()) {
        await deleteByFilter(pb, 'conversion_authorizations', `ruleId="${ruleId}"`);
        await deleteOne(pb, 'conversion_rules', ruleId);
    }
    for (const creditTypeId of created.extraCreditTypeIds.reverse()) {
        await deleteOne(pb, 'credit_types', creditTypeId);
    }
    await deleteOne(pb, 'credit_types', created.creditType?.id);
    await deleteOne(pb, 'course_specs', created.courseSpec?.id);
}

async function createSessionFixture(pb, options) {
    const now = Date.now();
    const session = await pb.collection('sessions').create({
        code: `IT-SESSION-${options.suffix}-${options.marker}`,
        title: `Integration session ${options.suffix} ${options.marker}`,
        status: 'scheduled',
        startAt: new Date(now + 2 * 86400000).toISOString(),
        endAt: new Date(now + 2 * 86400000 + 3600000).toISOString(),
        requiredCreditTypeId: options.creditTypeId,
        requiredQuantity: 1,
        attendanceRuleSnapshot: {
            version: 1, present: 'consume', late: 'consume', leave: 'release', absent: 'consume',
        },
        settlementRuleSnapshot: { version: 1, cancelled: 'release' },
        teacherRuleSnapshot: {
            version: 1,
            rules: {
                lead: {
                    ruleId: 'business-integration-lead',
                    courseSpecId: created.courseSpec.id,
                    baseQuantity: 1,
                    durationFactor: 0,
                    participantFactor: 0,
                },
            },
        },
        rosterVersion: 1,
        version: 1,
    }, { requestKey: null });
    const sessionStudent = await pb.collection('session_students').create({
        sessionId: session.id,
        studentId: options.studentId,
        sourceClassIds: [],
        attendanceStatus: 'scheduled',
        creditStatus: 'pending',
        version: 1,
    }, { requestKey: null });
    return { session, sessionStudent };
}

async function deleteByFilter(pb, collection, filter) {
    const records = await pb.collection(collection).getFullList({ filter, requestKey: null });
    for (const record of records) await deleteOne(pb, collection, record.id);
}

async function deleteOne(pb, collection, id) {
    if (!id) return;
    try {
        await pb.collection(collection).delete(id, { requestKey: null });
    } catch (error) {
        if (error?.status !== 404) throw error;
    }
}
