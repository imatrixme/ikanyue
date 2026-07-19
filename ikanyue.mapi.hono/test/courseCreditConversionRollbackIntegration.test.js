const test = require('node:test');
const assert = require('node:assert/strict');

const { CourseCreditConversionService } = require('../src/services/courseCredits/conversionService');
const { PocketBaseBatchRepository } = require('../src/services/courseCredits/repositories');
const {
    connectLocalPocketBase,
    deleteByFilter,
    deleteOne,
    integrationMarker,
} = require('./support/courseCreditPocketBaseIntegration');

test('real PocketBase rolls back every conversion write after an injected batch failure', {
    skip: process.env.PB_COURSE_CREDIT_INTEGRATION !== '1',
}, async (t) => {
    const pb = await connectLocalPocketBase();
    const students = await pb.collection('students').getList(1, 1, { requestKey: null });
    if (students.totalItems === 0) {
        t.skip('local production copy has no student record');
        return;
    }
    const marker = integrationMarker('rollback');
    const created = {};
    try {
        created.courseSpec = await pb.collection('course_specs').create({
            code: `RB-SPEC-${marker}`,
            name: `Rollback ${marker}`,
            deliveryMode: 'one_to_one',
            durationMinutes: 60,
            teacherTier: 'integration',
            status: 'active',
        }, { requestKey: null });
        created.sourceType = await pb.collection('credit_types').create({
            code: `RB-SOURCE-${marker}`,
            name: `Rollback source ${marker}`,
            kind: 'universal',
            consumable: false,
            unitLabel: 'value',
            referenceUnitValue: 1,
            status: 'active',
        }, { requestKey: null });
        created.targetType = await pb.collection('credit_types').create({
            code: `RB-TARGET-${marker}`,
            name: `Rollback target ${marker}`,
            kind: 'course',
            courseSpecId: created.courseSpec.id,
            consumable: true,
            unitLabel: 'lesson',
            referenceUnitValue: 100,
            status: 'active',
        }, { requestKey: null });
        created.rule = await pb.collection('conversion_rules').create({
            sourceCreditTypeId: created.sourceType.id,
            targetCreditTypeId: created.targetType.id,
            sourceQuantity: 100,
            targetQuantity: 1,
            minSourceQuantity: 100,
            maxSourceQuantity: 100,
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
        created.sourceOperation = await pb.collection('credit_operations').create({
            operationNo: `rb-source-${marker}`,
            studentId: students.items[0].id,
            type: 'grant',
            status: 'committed',
            idempotencyKey: `rb-source-${marker}`,
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
        created.sourceBatch = await pb.collection('credit_batches').create({
            studentId: students.items[0].id,
            creditTypeId: created.sourceType.id,
            sourceOperationId: created.sourceOperation.id,
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
            grantSnapshot: { integration: marker },
            listUnitValue: 1,
            paidUnitCost: 1,
            currency: 'CNY',
            version: 1,
        }, { requestKey: null });

        const baseRepository = new PocketBaseBatchRepository(pb);
        const failingRepository = injectInvalidAllocation(baseRepository);
        const service = new CourseCreditConversionService(failingRepository);
        const input = {
            studentId: students.items[0].id,
            ruleId: created.rule.id,
            sourceQuantity: 100,
        };
        const preview = await service.previewConversion(input);
        await assert.rejects(service.convertCredits({
            ...input,
            previewAt: preview.previewAt,
            previewHash: preview.previewHash,
            idempotencyKey: `rb-convert-${marker}`,
            actorId: 'integration-test',
        }));

        const sourceAfter = await pb.collection('credit_batches').getOne(created.sourceBatch.id, { requestKey: null });
        assert.equal(sourceAfter.availableQuantity, 100);
        assert.equal(sourceAfter.consumedQuantity, 0);
        assert.equal(sourceAfter.version, 1);
        assert.equal((await pb.collection('credit_operations').getList(1, 1, {
            filter: `idempotencyKey="convertCredits:rb-convert-${marker}"`, requestKey: null,
        })).totalItems, 0);
        assert.equal((await pb.collection('credit_batches').getList(1, 1, {
            filter: `studentId="${students.items[0].id}" && creditTypeId="${created.targetType.id}"`, requestKey: null,
        })).totalItems, 0);
        assert.equal((await pb.collection('conversion_allocations').getList(1, 1, {
            filter: `sourceBatchId="${created.sourceBatch.id}"`, requestKey: null,
        })).totalItems, 0);
    } finally {
        await cleanup(pb, created);
    }
});

function injectInvalidAllocation(repository) {
    return {
        get: repository.get.bind(repository),
        list: repository.list.bind(repository),
        findFirst: repository.findFirst.bind(repository),
        send(plan) {
            return repository.send([...plan, {
                action: 'create',
                collection: 'conversion_allocations',
                data: {},
            }]);
        },
    };
}

async function cleanup(pb, created) {
    await deleteByFilter(pb, 'conversion_allocations', `sourceBatchId="${created.sourceBatch?.id || ''}"`);
    await deleteByFilter(pb, 'credit_events', `batchId="${created.sourceBatch?.id || ''}"`);
    await deleteByFilter(pb, 'credit_version_claims', `entityId="${created.sourceBatch?.id || ''}"`);
    await deleteOne(pb, 'credit_batches', created.sourceBatch?.id);
    await deleteOne(pb, 'credit_operations', created.sourceOperation?.id);
    await deleteOne(pb, 'conversion_rules', created.rule?.id);
    await deleteOne(pb, 'credit_types', created.targetType?.id);
    await deleteOne(pb, 'credit_types', created.sourceType?.id);
    await deleteOne(pb, 'course_specs', created.courseSpec?.id);
}
