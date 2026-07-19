const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CourseCreditError,
    conversionTermsFingerprint,
    materialConversionTerms,
    validateConversionAuthorization,
} = require('../src/services/courseCredits/domain');
const {
    buildConversionTargetPreview,
    concreteExpiryPolicy,
    conversionSourceRejection,
    normalizeSourceBatch,
    planConversionSources,
    positiveVersion,
} = require('../src/services/courseCredits/conversionPlanning');
const {
    CourseCreditConversionService,
    buildTargetBatch,
    conversionBatchFilter,
    isVersionConflict,
    optionalFutureDate,
    resolvePreparationTime,
    sourceUpdate,
    validateConversionInput,
} = require('../src/services/courseCredits/conversionService');
const { fingerprintRequest } = require('../src/services/courseCredits/repositories/operationRepository');
const { assertBatchPlanPolicy } = require('../src/services/courseCredits/repositories/sdkBatchRepository');

const NOW = '2026-07-17T10:00:00.000Z';

test('conversion preview splits target outcomes by source expiry and cost', async () => {
    const repository = mockRepository();
    const preview = await service(repository).previewConversion(command());

    assert.equal(preview.sourceQuantity, 300);
    assert.equal(preview.targetQuantity, 3);
    assert.equal(preview.targets.length, 2);
    assert.deepEqual(preview.targets.map((target) => target.effectiveExpiresAt), [
        '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
    ]);
    assert.deepEqual(preview.targets.map((target) => target.paidUnitCost), [90, 80]);
    assert.match(preview.previewHash, /^[a-f0-9]{64}$/);
});

test('explicit conversion consumes sources and creates traceable targets in one SDK batch', async () => {
    const repository = mockRepository();
    const converter = service(repository);
    const preview = await converter.previewConversion(command());
    const result = await converter.convertCredits(command({
        idempotencyKey: 'convert-key', previewAt: preview.previewAt, previewHash: preview.previewHash,
    }));

    assert.equal(result.replayed, false);
    assert.equal(result.targets.length, 2);
    assert.doesNotThrow(() => assertBatchPlanPolicy(repository.plan));
    const operation = repository.plan.find((item) => item.collection === 'credit_operations').data;
    assert.equal(operation.reason, 'credit_conversion');
    assert.equal(operation.outcome, 'committed');
    assert.equal(operation.beforeSummary.sourceQuantity, 300);
    assert.equal(operation.afterSummary.targetsCount, 2);
    assert.equal(repository.plan.filter((item) => item.collection === 'credit_version_claims').length, 2);
    assert.equal(repository.plan.filter((item) => item.action === 'update' && item.collection === 'credit_batches').length, 2);
    assert.equal(repository.plan.filter((item) => item.action === 'create' && item.collection === 'credit_batches').length, 2);
    assert.equal(repository.plan.filter((item) => item.collection === 'conversion_allocations').length, 2);
    assert.deepEqual(repository.plan.filter((item) => item.collection === 'credit_events')
        .map((item) => item.data.eventType), ['CONVERT_OUT', 'CONVERT_IN', 'CONVERT_OUT', 'CONVERT_IN']);
    const updates = repository.plan.filter((item) => item.action === 'update').map((item) => item.data);
    assert.deepEqual(updates, [
        { availableQuantity: 0, consumedQuantity: 100, status: 'depleted', version: 3 },
        { availableQuantity: 0, consumedQuantity: 200, status: 'depleted', version: 4 },
    ]);
});

test('standing authorization replaces preview hash only while material rule terms remain equal', async () => {
    const rule = conversionRule();
    const authorization = authorizationRecord(rule);
    const repository = mockRepository({ authorization });
    const result = await service(repository).convertCredits(command({
        authorizationId: authorization.id, idempotencyKey: 'authorized-key',
    }));
    assert.equal(result.replayed, false);

    const staleRepository = mockRepository({
        authorization,
        rule: conversionRule({ targetQuantity: 2 }),
    });
    await assert.rejects(service(staleRepository).convertCredits(command({
        authorizationId: authorization.id, idempotencyKey: 'stale-key',
    })), hasCode('CONVERSION_AUTHORIZATION_STALE'));
});

test('automatic authorization persists the exact material terms and replays idempotently', async () => {
    const repository = mockRepository();
    const converter = service(repository);
    const preview = await converter.previewConversion(command());
    const authorizationInput = {
        studentId: 'student', ruleId: 'rule', validTo: '2026-08-01T00:00:00Z',
        idempotencyKey: 'authorize-key', consentSource: 'explicit_preview',
        previewAt: preview.previewAt, previewHash: preview.previewHash, sourceQuantity: 300,
    };
    const result = await converter.authorizeAutomaticConversion(authorizationInput);
    const record = repository.plan[0].data;
    assert.equal(result.replayed, false);
    assert.equal(result.previewHash, preview.previewHash);
    assert.equal(record.termsFingerprint, conversionTermsFingerprint(conversionRule()));
    assert.equal(record.consentSource, 'explicit_preview');

    const replayRepository = mockRepository({
        existingAuthorization: { ...record, id: 'stored-authorization' },
    });
    const replay = await service(replayRepository).authorizeAutomaticConversion(authorizationInput);
    assert.equal(replay.replayed, true);
    assert.equal(replay.authorizationId, 'stored-authorization');

    replayRepository.existingAuthorization.requestFingerprint = 'different';
    await assert.rejects(service(replayRepository).authorizeAutomaticConversion({
        studentId: 'student', ruleId: 'rule', validTo: '2026-08-01T00:00:00Z',
        idempotencyKey: 'authorize-key',
    }), hasCode('IDEMPOTENCY_CONFLICT'));

    await assert.rejects(converter.authorizeAutomaticConversion({
        ...authorizationInput, idempotencyKey: 'stale-preview', previewHash: 'stale',
    }), hasCode('CONVERSION_PREVIEW_STALE'));
});

test('conversion operation replay and same-request race preserve one immutable result', async () => {
    const requestHash = fingerprintRequest({
        authorizationId: '', previewHash: 'hash', ruleId: 'rule', sourceQuantity: 300,
        previewAt: NOW, studentId: 'student', targetTermEnd: '',
    });
    const replayRepository = mockRepository({ existingOperation: operation(requestHash) });
    const replay = await service(replayRepository).convertCredits(command({
        idempotencyKey: 'convert-key', previewAt: NOW, previewHash: 'hash',
    }));
    assert.equal(replay.replayed, true);

    const converter = service(mockRepository({ raceReplayAfterSend: true }));
    const preview = await converter.previewConversion(command());
    const raced = await converter.convertCredits(command({
        idempotencyKey: 'race-key', previewAt: preview.previewAt, previewHash: preview.previewHash,
    }));
    assert.equal(raced.replayed, true);
});

test('conversion rejects stale consent, insufficient source steps, invalid rules, and storage failures', async () => {
    const converter = service(mockRepository());
    await assert.rejects(converter.convertCredits(command({
        idempotencyKey: 'missing-preview', previewAt: NOW, previewHash: 'stale',
    })), hasCode('CONVERSION_PREVIEW_STALE'));
    await assert.rejects(service(mockRepository({ batches: [sourceBatch({ availableQuantity: 50 })] }))
        .previewConversion(command()), hasCode('CREDIT_INSUFFICIENT'));
    await assert.rejects(service(mockRepository({ rule: conversionRule({ status: 'inactive' }) }))
        .previewConversion(command()), hasCode('CONVERSION_RULE_INACTIVE'));
    await assert.rejects(service(mockRepository({ targetType: { kind: 'universal', consumable: false } }))
        .previewConversion(command()), hasCode('CONVERSION_TARGET_NOT_CONSUMABLE'));
    await assert.rejects(service(mockRepository({ sourceType: null })).previewConversion(command()),
        hasCode('CONVERSION_TYPE_REQUIRED'));

    const unknownRepository = mockRepository({ sendError: new Error('batch failed') });
    const unknownService = service(unknownRepository);
    const preview = await unknownService.previewConversion(command());
    await assert.rejects(unknownService.convertCredits(command({
        idempotencyKey: 'storage', previewAt: preview.previewAt, previewHash: preview.previewHash,
    })), (error) => error.code === 'COURSE_CREDIT_BATCH_FAILED');
});

test('conversion planning and authorization helpers cover policy boundaries', () => {
    const rule = conversionRule();
    const active = sourceBatch();
    assert.equal(conversionSourceRejection(active, rule, NOW), null);
    assert.equal(conversionSourceRejection({ ...active, creditTypeId: 'other' }, rule, NOW), 'CREDIT_TYPE_MISMATCH');
    assert.equal(conversionSourceRejection({ ...active, locked: true }, rule, NOW), 'BATCH_LOCKED');
    assert.equal(conversionSourceRejection({ ...active, status: 'expired' }, rule, NOW), 'BATCH_UNAVAILABLE');
    assert.equal(conversionSourceRejection({ ...active, availableQuantity: 50 }, rule, NOW), 'CONVERSION_BELOW_MINIMUM');
    assert.equal(conversionSourceRejection({ ...active, effectiveExpiresAt: NOW }, rule, NOW), 'BATCH_EXPIRED');
    const unactivated = { ...active, status: 'unactivated', activatedAt: '', effectiveExpiresAt: '' };
    assert.equal(conversionSourceRejection({ ...unactivated, activationDeadline: '' }, rule, NOW), 'ACTIVATION_DEADLINE_REQUIRED');
    assert.equal(conversionSourceRejection({ ...unactivated, activationDeadline: NOW }, rule, NOW), 'ACTIVATION_DEADLINE_PASSED');
    assert.equal(conversionSourceRejection({ ...unactivated, activationDeadline: '2026-08-01T00:00:00Z' }, rule, NOW), null);
    const planned = planConversionSources([active], 200, rule, { now: NOW });
    assert.equal(planned.missingQuantity, 100);
    assert.equal(normalizeSourceBatch({ ...active, version: undefined }).version, 1);
    assert.equal(positiveVersion(4), 4);
    assert.equal(concreteExpiryPolicy({ expiryPolicy: 'TARGET_TERM_END' }, { effectiveExpiresAt: NOW }, active), 'TERM_END');
    assert.equal(concreteExpiryPolicy({ expiryPolicy: 'INHERIT_SOURCE' }, { effectiveExpiresAt: null }, active), 'NO_EXPIRY');
    assert.equal(concreteExpiryPolicy({ expiryPolicy: 'INHERIT_SOURCE' }, { effectiveExpiresAt: NOW }, { expiryPolicy: 'NO_EXPIRY' }), 'NO_EXPIRY');
    const target = buildConversionTargetPreview(rule, { batch: active, quantity: 100 }, NOW);
    assert.equal(target.targetQuantity, 1);
    assert.deepEqual(sourceUpdate({ availableQuantity: 1, consumedQuantity: 2, status: 'active', version: 3 }),
        sourceUpdate({ availableQuantity: 1, consumedQuantity: 2, status: 'active', version: 3 }));
    assert.match(conversionBatchFilter('s"', 'c\\'), /studentId=/);
    assertCode(() => validateConversionInput({}), 'STUDENT_ID_REQUIRED');
    assert.equal(optionalFutureDate('', Date.parse(NOW)), '');
    assertCode(() => optionalFutureDate('bad', Date.parse(NOW)), 'INVALID_AUTHORIZATION_EXPIRY');
    assert.equal(resolvePreparationTime({}, () => Date.parse(NOW)), NOW);
    assertCode(() => resolvePreparationTime({ previewAt: 'bad' }, () => Date.parse(NOW)),
        'CONVERSION_PREVIEW_TIMESTAMP_INVALID');
    assertCode(() => resolvePreparationTime({ previewAt: '2026-07-17T09:54:00Z' }, () => Date.parse(NOW)),
        'CONVERSION_PREVIEW_EXPIRED');
    assertCode(() => resolvePreparationTime({ previewAt: '2026-07-17T10:01:01Z' }, () => Date.parse(NOW)),
        'CONVERSION_PREVIEW_EXPIRED');
    assert.equal(isVersionConflict({ status: 400 }), true);
    assert.equal(isVersionConflict({ status: 409 }), true);
    assert.equal(isVersionConflict({ code: 'VERSION_CONFLICT' }), true);
    assert.equal(isVersionConflict(new Error('other')), false);

    const terms = materialConversionTerms(rule);
    assert.equal(terms.maxSourceQuantity, 1000);
    assert.deepEqual(materialConversionTerms(conversionRule({
        maxSourceQuantity: undefined,
        validityDurationDays: undefined,
        activationDeadlineDays: undefined,
        reversible: true,
    })), {
        sourceCreditTypeId: 'universal',
        targetCreditTypeId: 'course',
        sourceQuantity: 100,
        targetQuantity: 1,
        minSourceQuantity: 100,
        maxSourceQuantity: null,
        expiryPolicy: 'INHERIT_SOURCE',
        activationMode: 'GRANT_TIME',
        validityDurationDays: null,
        activationDeadlineDays: null,
        reversible: true,
    });
    assertCode(() => validateConversionAuthorization(null, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_REQUIRED');
    const valid = authorizationRecord(rule);
    assert.equal(validateConversionAuthorization(valid, rule, { studentId: 'student', now: NOW }), valid);
    assertCode(() => validateConversionAuthorization({ ...valid, status: 'revoked' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_INACTIVE');
    assertCode(() => validateConversionAuthorization({ ...valid, studentId: 'other' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH');
    assertCode(() => validateConversionAuthorization({ ...valid, ruleId: 'other' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH');
    assertCode(() => validateConversionAuthorization({ ...valid, sourceCreditTypeId: 'other' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH');
    assertCode(() => validateConversionAuthorization({ ...valid, targetCreditTypeId: 'other' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH');
    assertCode(() => validateConversionAuthorization({ ...valid, validTo: NOW }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_INACTIVE');
    assertCode(() => validateConversionAuthorization({ ...valid, termsFingerprint: 'stale' }, rule, { studentId: 'student', now: NOW }),
        'CONVERSION_AUTHORIZATION_STALE');
});

function service(repository) {
    return new CourseCreditConversionService(repository, {
        clock: () => Date.parse(NOW), idFactory: ids(),
    });
}

function mockRepository(options = {}) {
    const rule = options.rule || conversionRule();
    const repository = {
        existingOperation: options.existingOperation || null,
        existingAuthorization: options.existingAuthorization || null,
        plan: null,
        async findFirst(collection) {
            return collection === 'credit_operations' ? this.existingOperation : this.existingAuthorization;
        },
        async get(collection, id) {
            if (collection === 'conversion_rules') return rule;
            if (collection === 'credit_types') {
                if (id === rule.sourceCreditTypeId) {
                    return options.sourceType === null ? null : (options.sourceType || universalType());
                }
                return options.targetType || courseType();
            }
            if (collection === 'conversion_authorizations') return options.authorization || null;
            throw new Error(`Unexpected get ${collection}`);
        },
        async list() { return options.batches || [sourceBatch(), sourceBatch({
            id: 'source-later', originalQuantity: 200, availableQuantity: 200,
            paidUnitCost: 0.8, effectiveExpiresAt: '2026-09-01T00:00:00Z', version: 3,
        })]; },
        async send(plan) {
            this.plan = plan;
            if (options.raceReplayAfterSend) {
                this.existingOperation = plan.find((item) => item.collection === 'credit_operations').data;
                throw Object.assign(new Error('race'), { status: 409 });
            }
            if (options.sendError) throw options.sendError;
            return plan.map((item) => item.data || {});
        },
    };
    return repository;
}

function conversionRule(changes = {}) {
    return {
        id: 'rule', sourceCreditTypeId: 'universal', targetCreditTypeId: 'course',
        sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100, maxSourceQuantity: 1000,
        expiryPolicy: 'INHERIT_SOURCE', activationMode: 'GRANT_TIME', validityDurationDays: 0,
        activationDeadlineDays: 0, reversible: false, status: 'active',
        validFrom: '2026-01-01T00:00:00Z', validTo: '', version: 2, ...changes,
    };
}

function sourceBatch(changes = {}) {
    return {
        id: 'source-first', studentId: 'student', creditTypeId: 'universal',
        originalQuantity: 100, availableQuantity: 100, frozenQuantity: 0, consumedQuantity: 0,
        expiredQuantity: 0, reversedQuantity: 0, status: 'active', validFrom: '2026-01-01T00:00:00Z',
        effectiveExpiresAt: '2026-08-01T00:00:00Z', activationMode: 'GRANT_TIME',
        activatedAt: '2026-01-01T00:00:00Z', expiryPolicy: 'FIXED_DURATION',
        listUnitValue: 1, paidUnitCost: 0.9, currency: 'CNY', priority: 0, version: 2,
        created: '2026-01-01T00:00:00Z', ...changes,
    };
}

function universalType() {
    return { id: 'universal', kind: 'universal', courseSpecId: '', consumable: false };
}

function courseType() {
    return { id: 'course', kind: 'course', courseSpecId: 'spec', consumable: true };
}

function authorizationRecord(rule) {
    return {
        id: 'authorization', studentId: 'student', ruleId: rule.id,
        sourceCreditTypeId: rule.sourceCreditTypeId, targetCreditTypeId: rule.targetCreditTypeId,
        termsFingerprint: conversionTermsFingerprint(rule), status: 'active',
        validFrom: '2026-07-01T00:00:00Z', validTo: '2026-08-01T00:00:00Z',
    };
}

function command(changes = {}) {
    return { studentId: 'student', ruleId: 'rule', sourceQuantity: 300, ...changes };
}

function operation(requestHash) {
    return {
        id: 'stored-operation', requestSnapshot: { requestHash },
        resultSnapshot: { operationId: 'stored-operation', targets: [] },
    };
}

function ids() {
    let value = 0;
    return () => String(++value).padStart(15, '0');
}

function assertCode(action, code) {
    assert.throws(action, hasCode(code));
}

function hasCode(code) {
    return (error) => error instanceof CourseCreditError && error.code === code;
}
